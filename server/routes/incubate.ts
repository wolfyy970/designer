import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { buildIncubatorUserPrompt } from '../../src/lib/prompts/incubator-user.ts';
import { getPromptBody } from '../lib/prompt-resolution.ts';
import { inlineGuidance } from '../lib/inline-guidance.ts';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import { parseJsonLenient } from '../lib/parse-json-lenient.ts';
import { extractLlmJsonObjectSegment } from '../lib/extract-llm-json.ts';
import {
  incubationFirstHypothesisEmpty,
  incubationLooksLikeTemplateEcho,
} from '../lib/incubation-template-echo.ts';
import { generateId, now } from '../../src/lib/utils.ts';
import { env } from '../env.ts';
import { appendIncubateParsedLogEntry } from '../log-store.ts';
import { runTaskAgentRoute } from '../services/task-agent-route-runner.ts';
import { runBrainstormPrelude } from '../services/incubator-brainstorm.ts';
import { IncubateRequestSchema } from '../../src/api/request-schemas.ts';
import { normalizeIncubationPlanExplorationAxes } from '../../src/lib/exploration-axis-normalizer.ts';
import type { DesignSpec } from '../../src/types/spec.ts';
import type { Context } from 'hono';

const incubate = new Hono();

/** LLMs often emit `range` as a string or as an array of discrete values — normalize to string. */
const dimensionRangeSchema = z.union([
  z.string(),
  z.array(z.string()).transform((a) => a.join(', ')),
]);

/** Models occasionally emit `measurements` as an array of bullet points despite the prompt asking for a string. Normalize. */
const measurementsSchema = z.union([
  z.string(),
  z.array(z.unknown()).transform((a) => a.map((x) => String(x)).join('; ')),
]);

const DimensionSchema = z.object({
  name: z.string().default(''),
  range: dimensionRangeSchema.default(''),
  isConstant: z.boolean().default(false),
});

const HypothesisStrategyParseSchema = z
  .object({
    name: z.string().default('Unnamed Hypothesis'),
    hypothesis: z.string().optional().default(''),
    primaryEmphasis: z.string().optional(),
    rationale: z.string().default(''),
    measurements: measurementsSchema.optional().default(''),
    dimensionValues: z
      .record(z.string(), z.unknown())
      .optional()
      .default(() => ({})),
  })
  .transform((v) => ({
    id: generateId(),
    name: v.name,
    hypothesis: v.hypothesis || v.primaryEmphasis || '',
    rationale: v.rationale,
    measurements: v.measurements,
    dimensionValues: Object.fromEntries(
      Object.entries(v.dimensionValues ?? {}).map(([k, val]) => [k, String(val)]),
    ),
  }));

const LLMResponseSchema = z
  .object({
    dimensions: z
      .array(z.unknown())
      .default([])
      .transform((arr) =>
        arr.map((d) => DimensionSchema.parse(typeof d === 'object' && d !== null ? d : {})),
      ),
    hypotheses: z.array(z.unknown()).optional(),
    variants: z.array(z.unknown()).optional(),
  })
  .transform((obj) => ({
    dimensions: obj.dimensions,
    hypotheses: (obj.hypotheses ?? obj.variants ?? []).map((v) =>
      HypothesisStrategyParseSchema.parse(typeof v === 'object' && v !== null ? v : {}),
    ),
  }));

/**
 * Run the brainstorm prelude and mutate the body's design-brief section
 * in place. Returns `undefined` on success (so the caller continues to
 * the regular incubator stage) or a JSON error `Response` on failure.
 *
 * On success the brief content is replaced with the augmented version
 * (original brief + `<product_shape_candidates>` block). Downstream the
 * incubator's `buildInternalContext(spec)` reads the brief content
 * directly and the new block flows naturally to the model.
 */
async function applyBrainstormPrelude(
  c: Context,
  body: { spec: DesignSpec; providerId: string; modelId: string },
  brief: string,
): Promise<Response | undefined> {
  try {
    const { augmentedBrief } = await runBrainstormPrelude({
      designBrief: brief,
      providerId: body.providerId,
      modelId: body.modelId,
      signal: c.req.raw.signal,
      correlationId: randomUUID(),
    });
    const briefSection = body.spec.sections['design-brief'];
    if (briefSection) {
      // Mutate in place: the rest of the route reads body.spec only.
      body.spec.sections['design-brief'] = {
        ...briefSection,
        content: augmentedBrief,
      };
    }
    return undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (env.isDev) {
      console.debug('[incubate] brainstorm prelude failed', { message });
    }
    return c.json(
      { error: `Brainstorm prelude failed: ${message}` },
      500,
    );
  }
}

incubate.post('/', async (c) => {
  const parsed = await parseRequestJson(c, IncubateRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId, 'incubate');
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };

  // Optional brainstorm prelude. When enabled, run brainstorm → curation
  // out-of-band of the SSE stream and stitch the curated 5 directions
  // into the spec's design-brief section before the incubator runs.
  // Stitched form is `<product_shape_candidates>…</product_shape_candidates>`
  // appended to the brief content, which then propagates through
  // `buildInternalContext(spec)`.
  if (body.promptOptions?.brainstormFirst === true) {
    const brief = body.spec.sections['design-brief']?.content?.trim();
    if (brief) {
      const preludeError = await applyBrainstormPrelude(c, body, brief);
      if (preludeError) return preludeError;
    }
  }

  const userPromptTemplate = await getPromptBody('incubator-user-inputs');
  const assembledSpec = buildIncubatorUserPrompt(
    body.spec,
    userPromptTemplate,
    body.referenceDesigns,
    body.promptOptions,
  );

  const guidance = await inlineGuidance('hypotheses-generator-system', 'hypotheses_generator_guidance');
  const agentUserPrompt = `<task>
Analyze the design specification below and produce global exploration axes with hypothesis strategies.

Write the complete JSON result to \`result.json\` in the workspace root. The JSON must contain:
- "dimensions": array of { name, range, isConstant }
- "hypotheses": array of { name, hypothesis, rationale, measurements, dimensionValues }
</task>

${guidance}

${assembledSpec}`;

  return runTaskAgentRoute(c, {
    routeLabel: 'incubate',
    body,
    userPrompt: agentUserPrompt,
    sessionType: 'incubation',
    thinkingTask: 'incubate',
    resultFile: 'result.json',
    initialProgressMessage: 'Incubating spec to hypotheses…',
    debugPayload: (b) => ({
      specSections: Object.keys(b.spec.sections).length,
      hypothesisCount: b.promptOptions?.count,
    }),
    onTaskResult: async (taskResult, { write, correlationId }) => {
      const jsonStr = extractLlmJsonObjectSegment(taskResult.result);
      const raw = parseJsonLenient(jsonStr);
      const { dimensions, hypotheses } = LLMResponseSchema.parse(
        typeof raw === 'object' && raw !== null ? raw : {},
      );
      const plan = normalizeIncubationPlanExplorationAxes({
        id: generateId(),
        specId: body.spec.id,
        dimensions,
        hypotheses,
        generatedAt: now(),
        incubatorModel: body.modelId,
      });
      if (incubationLooksLikeTemplateEcho(plan)) {
        if (env.isDev) {
          console.debug('[incubate] validation failed: template echo', {
            correlationId,
            hypothesisCount: plan.hypotheses.length,
          });
        }
        throw new Error(
          'The model returned placeholder text instead of real hypotheses (often from copying a schema example). Try Generate again, or switch model.',
        );
      }
      if (incubationFirstHypothesisEmpty(plan)) {
        if (env.isDev) {
          console.debug('[incubate] validation failed: empty hypothesis text', {
            correlationId,
            hypothesisCount: plan.hypotheses.length,
          });
        }
        throw new Error(
          'The model returned no hypothesis text (the core bet field was empty). Try Generate again, or switch model.',
        );
      }
      const firstBet = plan.hypotheses[0]?.hypothesis ?? '';
      appendIncubateParsedLogEntry({
        correlationId,
        hypothesisCount: plan.hypotheses.length,
        hypothesisNames: plan.hypotheses.map((h) => h.name),
        firstHypothesisText: firstBet,
        dimensionCount: plan.dimensions.length,
      });
      if (env.isDev) {
        console.debug('[incubate] plan parsed (before incubate_result SSE)', {
          correlationId,
          hypothesisCount: plan.hypotheses.length,
          hypothesisNames: plan.hypotheses.map((h) => h.name),
          firstHypothesisText: firstBet.length > 400 ? `${firstBet.slice(0, 400)}…` : firstBet,
          dimensionCount: plan.dimensions.length,
        });
      }
      await write(SSE_EVENT_NAMES.incubate_result, JSON.parse(JSON.stringify(plan)));
    },
  });
});

export default incubate;
