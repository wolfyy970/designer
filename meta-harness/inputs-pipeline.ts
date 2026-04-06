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
  promptOverrides?: Record<string, string>;
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

function normalizeFacetContent(val: unknown): string {
  if (typeof val === 'string') return val;
  if (
    val &&
    typeof val === 'object' &&
    'content' in val &&
    typeof (val as { content: unknown }).content === 'string'
  ) {
    return (val as { content: string }).content;
  }
  return '';
}

export async function runInputsGeneratePipeline(
  params: InputsPipelineParams,
): Promise<InputsPipelineResult> {
  const {
    testCase,
    apiBaseUrl,
    promptOverrides,
    inputsGenerateProviderId,
    inputsGenerateModelId,
    inputsRubricApiKey,
    inputsRubricModel,
    signal,
  } = params;
  const timeoutMs = params.timeoutMs ?? DEFAULT_INPUTS_GENERATE_TIMEOUT_MS;
  const openRouterChatTimeoutMs = params.openRouterChatTimeoutMs;

  const brief = normalizeFacetContent(testCase.spec.sections['design-brief'] ?? '');
  if (!brief.trim()) {
    throw new Error('Inputs pipeline requires a non-empty design-brief in the test case');
  }

  const existingDesign = normalizeFacetContent(testCase.spec.sections['existing-design'] ?? '');

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
      if (existingDesign.trim()) body.existingDesign = existingDesign;
      if (generated['research-context']) body.researchContext = generated['research-context'];
      if (generated['objectives-metrics']) body.objectivesMetrics = generated['objectives-metrics'];
      if (generated['design-constraints']) body.designConstraints = generated['design-constraints'];
      if (promptOverrides && Object.keys(promptOverrides).length > 0) {
        body.promptOverrides = promptOverrides;
      }

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
        clearTimeout(timer);

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(`POST /api/inputs/generate ${res.status}: ${errBody.slice(0, 500)}`);
        }

        const json = (await res.json()) as { result?: string };
        generatedText = (json.result ?? '').trim();
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
