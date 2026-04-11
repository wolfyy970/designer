import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { DesignSpecSchema } from '../../src/types/spec.ts';
import type { IncubatorPromptOptions } from '../../src/lib/prompts/incubator-user.ts';
import { buildIncubatorUserPrompt } from '../../src/lib/prompts/incubator-user.ts';
import { HypothesisStrategySchema } from '../lib/hypothesis-schemas.ts';
import { getPromptBody } from '../lib/prompt-resolution.ts';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { runTaskAgentSseBody } from '../lib/sse-task-route.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import { executeTaskAgentStream } from '../services/task-agent-execution.ts';
import { parseJsonLenient } from '../lib/parse-json-lenient.ts';
import { extractLlmJsonObjectSegment } from '../lib/extract-llm-json.ts';
import { generateId, now } from '../../src/lib/utils.ts';

const incubate = new Hono();

const IncubatorPromptOptionsSchema = z.object({
  count: z.number().int().positive().optional(),
  existingStrategies: z.array(HypothesisStrategySchema).optional(),
}) satisfies z.ZodType<IncubatorPromptOptions>;

const IncubateRequestSchema = z.object({
  spec: DesignSpecSchema,
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  referenceDesigns: z
    .array(
      z.object({
        name: z.string(),
        code: z.string(),
      }),
    )
    .optional(),
  supportsVision: z.boolean().optional(),
  promptOptions: IncubatorPromptOptionsSchema.optional(),
});

const DimensionSchema = z.object({
  name: z.string().default(''),
  range: z.string().default(''),
  isConstant: z.boolean().default(false),
});

const HypothesisStrategyParseSchema = z
  .object({
    name: z.string().default('Unnamed Hypothesis'),
    hypothesis: z.string().optional().default(''),
    primaryEmphasis: z.string().optional(),
    rationale: z.string().default(''),
    measurements: z.string().default(''),
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

incubate.post('/', async (c) => {
  const parsed = await parseRequestJson(c, IncubateRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };

  const userPromptTemplate = await getPromptBody('incubator-user-inputs');
  const assembledSpec = buildIncubatorUserPrompt(
    body.spec,
    userPromptTemplate,
    body.referenceDesigns,
    body.promptOptions,
  );

  const agentUserPrompt = `<task>
Analyze the design specification below and produce a dimension map with hypothesis strategies.

Write the complete JSON result to \`result.json\` in the workspace root. The JSON must contain:
- "dimensions": array of { name, range, isConstant }
- "hypotheses": array of { name, hypothesis, rationale, measurements, dimensionValues }

Use the \`use_skill\` tool to load relevant skills before beginning your analysis.
</task>

${assembledSpec}`;

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    const correlationId = crypto.randomUUID();
    await runTaskAgentSseBody(stream, async ({ write, allocId, gate }) => {
      const taskResult = await executeTaskAgentStream(
        stream,
        {
          userPrompt: agentUserPrompt,
          providerId: body.providerId,
          modelId: body.modelId,
          sessionType: 'incubation',
          signal: abortSignal,
          correlationId,
          resultFile: 'result.json',
          initialProgressMessage: 'Incubating spec to hypotheses…',
        },
        { allocId, writeGate: gate },
      );

      if (taskResult) {
        const jsonStr = extractLlmJsonObjectSegment(taskResult.result);
        const raw = parseJsonLenient(jsonStr);
        const { dimensions, hypotheses } = LLMResponseSchema.parse(
          typeof raw === 'object' && raw !== null ? raw : {},
        );
        const plan = {
          id: generateId(),
          specId: body.spec.id,
          dimensions,
          hypotheses,
          generatedAt: now(),
          incubatorModel: body.modelId,
        };
        await write(SSE_EVENT_NAMES.incubate_result, JSON.parse(JSON.stringify(plan)));
      }
    });
  });
});

export default incubate;
