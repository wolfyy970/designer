import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { DesignSpecSchema } from '../../src/types/spec.ts';
import type { IncubatorPromptOptions } from '../../src/lib/prompts/incubator-user.ts';
import { HypothesisStrategySchema } from '../lib/hypothesis-schemas.ts';
import { incubateSpecStream } from '../services/incubator.ts';
import { createResolvePromptBody, sanitizePromptOverrides } from '../lib/prompt-overrides.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { createWriteGate } from '../lib/sse-write-gate.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';

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
  promptOverrides: z.record(z.string(), z.string()).optional(),
});

incubate.post('/', async (c) => {
  const parsed = await parseRequestJson(c, IncubateRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };

  const resolvePrompt = createResolvePromptBody(sanitizePromptOverrides(body.promptOverrides));
  const [systemPrompt, userPromptTemplate] = await Promise.all([
    resolvePrompt('hypotheses-generator-system'),
    resolvePrompt('incubator-user-inputs'),
  ]);

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let seq = 0;
    const allocId = () => String(seq++);
    const gate = createWriteGate();
    const correlationId = crypto.randomUUID();

    const write = async (event: string, data: Record<string, unknown>): Promise<void> => {
      const payload = JSON.stringify(data);
      await gate.enqueue(async () => {
        await stream.writeSSE({ data: payload, event, id: allocId() });
      });
    };

    try {
      await write(SSE_EVENT_NAMES.progress, { status: 'Incubating spec to hypotheses…' });
      const result = await incubateSpecStream(
        body.spec,
        body.modelId,
        body.providerId,
        {
          systemPrompt,
          userPromptTemplate,
          referenceDesigns: body.referenceDesigns,
          supportsVision: body.supportsVision,
          promptOptions: body.promptOptions,
        },
        {
          signal: abortSignal,
          correlationId,
          onProgressStatus: (status) => write(SSE_EVENT_NAMES.progress, { status }),
          onAccumulatedDelta: (code) => write(SSE_EVENT_NAMES.code, { code }),
        },
      );
      const planJson = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
      await write(SSE_EVENT_NAMES.incubate_result, planJson);
      await write(SSE_EVENT_NAMES.done, {});
    } catch (err) {
      await write(SSE_EVENT_NAMES.error, { error: normalizeError(err) });
      await write(SSE_EVENT_NAMES.done, {});
    }
  });
});

export default incubate;
