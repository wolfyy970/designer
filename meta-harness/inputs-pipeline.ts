/**
 * Inputs-generate pipeline for meta-harness --mode=inputs (and e2e expansion).
 *
 * Calls POST /api/inputs/generate three times (research-context, objectives-metrics,
 * design-constraints), passing cross-facet context so later inputs benefit from
 * earlier generated content. Then scores each result via the inputs rubric.
 */
import type { SimplifiedMetaHarnessTestCase } from './test-case-hydrator.ts';
import { scoreInputsWithRubric, type ScoreInputsResult } from './inputs-evaluator.ts';
import { DEFAULT_INPUTS_GENERATE_TIMEOUT_MS } from './constants.ts';
import { normalizeError } from '../src/lib/error-utils.ts';
import { readSseEventStream } from '../src/lib/sse-reader.ts';
import { SSE_EVENT_NAMES } from '../src/constants/sse-events.ts';
import { parseSseJsonObject } from './sse-utils.ts';
import { normalizeFlexContent } from './utils.ts';

const INPUT_FACET_TARGETS = [
  'research-context',
  'objectives-metrics',
  'design-constraints',
] as const;

export type InputsFacetTarget = (typeof INPUT_FACET_TARGETS)[number];

export type InputsPipelinePerFacet = {
  target: InputsFacetTarget;
  generated: string;
  rubric: ScoreInputsResult | null;
  error?: string;
};

export type InputsPipelineResult = {
  perFacet: InputsPipelinePerFacet[];
  overallMean: number | null;
  /** Generated content keyed by facet id (for e2e merging into test-case spec). */
  generatedByFacet: Partial<Record<InputsFacetTarget, string>>;
};

export type InputsPipelineParams = {
  testCase: SimplifiedMetaHarnessTestCase;
  apiBaseUrl: string;
  /** Model for the inputs-generate LLM call (reuses test case model). */
  inputsGenerateProviderId: string;
  inputsGenerateModelId: string;
  /** Model for the inputs rubric scoring LLM call. */
  inputsRubricApiKey: string;
  inputsRubricModel: string;
  timeoutMs?: number;
  openRouterChatTimeoutMs?: number;
  signal?: AbortSignal;
  onInputsGenerateStart?: (target: InputsFacetTarget) => void;
  onInputsGenerateDone?: (target: InputsFacetTarget, charCount: number) => void;
  onInputsRubricDone?: (target: InputsFacetTarget, mean: number) => void;
};

export async function runInputsGeneratePipeline(
  params: InputsPipelineParams,
): Promise<InputsPipelineResult> {
  const {
    testCase,
    apiBaseUrl,
    inputsGenerateProviderId,
    inputsGenerateModelId,
    inputsRubricApiKey,
    inputsRubricModel,
    signal,
  } = params;
  const timeoutMs = params.timeoutMs ?? DEFAULT_INPUTS_GENERATE_TIMEOUT_MS;
  const openRouterChatTimeoutMs = params.openRouterChatTimeoutMs;

  const brief = normalizeFlexContent(testCase.spec.sections['design-brief'] ?? '');
  if (!brief.trim()) {
    throw new Error('Inputs pipeline requires a non-empty design-brief in the test case');
  }

  const generated: Partial<Record<InputsFacetTarget, string>> = {};
  const perFacet: InputsPipelinePerFacet[] = [];

  for (const target of INPUT_FACET_TARGETS) {
    params.onInputsGenerateStart?.(target);

    let generatedText = '';
    let rubric: ScoreInputsResult | null = null;
    let error: string | undefined;

    try {
      const body: Record<string, unknown> = {
        inputId: target,
        designBrief: brief,
        providerId: inputsGenerateProviderId,
        modelId: inputsGenerateModelId,
      };
      if (generated['research-context']) body.researchContext = generated['research-context'];
      if (generated['objectives-metrics']) body.objectivesMetrics = generated['objectives-metrics'];
      if (generated['design-constraints']) body.designConstraints = generated['design-constraints'];

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const combinedSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;

      try {
        const base = apiBaseUrl.replace(/\/$/, '');
        const res = await fetch(`${base}/inputs/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: combinedSignal,
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(`POST /api/inputs/generate ${res.status}: ${errBody.slice(0, 500)}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body for inputs-generate stream');

        let streamText = '';
        let streamError: string | undefined;

        await readSseEventStream(reader, async (eventName, dataLine) => {
          const ev = eventName.trim();
          const parsed = parseSseJsonObject(dataLine);

          if (ev === SSE_EVENT_NAMES.error) {
            streamError =
              parsed && typeof parsed.error === 'string'
                ? parsed.error
                : dataLine || 'inputs-generate SSE error';
            return;
          }

          if (ev === SSE_EVENT_NAMES.task_result) {
            streamText =
              parsed && typeof parsed.result === 'string' ? parsed.result.trim() : '';
          }
        });

        if (streamError) throw new Error(streamError);
        generatedText = streamText;
      } finally {
        clearTimeout(timer);
      }

      if (!generatedText) {
        throw new Error(`Empty result from inputs-generate for ${target}`);
      }

      generated[target] = generatedText;
      params.onInputsGenerateDone?.(target, generatedText.length);

      rubric = await scoreInputsWithRubric({
        apiKey: inputsRubricApiKey,
        model: inputsRubricModel,
        inputFacetId: target,
        designBrief: brief,
        generatedContent: generatedText,
        signal,
        openRouterChatTimeoutMs,
      });
      params.onInputsRubricDone?.(target, rubric.mean);
    } catch (e) {
      error = normalizeError(e);
    }

    perFacet.push({ target, generated: generatedText, rubric, error });
  }

  const scoredMeans = perFacet.filter((s) => s.rubric != null).map((s) => s.rubric!.mean);
  const overallMean =
    scoredMeans.length > 0
      ? scoredMeans.reduce((a, b) => a + b, 0) / scoredMeans.length
      : null;

  return { perFacet, overallMean, generatedByFacet: generated };
}
