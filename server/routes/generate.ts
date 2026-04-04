import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { GenerateStreamBodySchema } from '../lib/generate-stream-schema.ts';
import { executeGenerateStreamSafe } from '../services/generate-execution.ts';
import { apiJsonError } from '../lib/api-json-error.ts';
import { clampEvaluatorOptional, clampProviderModel } from '../lib/lockdown-model.ts';

const generate = new Hono();

generate.post('/', async (c) => {
  const raw = await c.req.json();
  const parsed = GenerateStreamBodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiJsonError(c, 400, 'Invalid request', parsed.error.flatten());
  }
  const m = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const ev = clampEvaluatorOptional(parsed.data.evaluatorProviderId, parsed.data.evaluatorModelId);
  const body = { ...parsed.data, ...ev, providerId: m.providerId, modelId: m.modelId };
  const correlationId =
    body.correlationId?.trim() || crypto.randomUUID();

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let id = 0;
    const allocId = () => String(id++);

    await executeGenerateStreamSafe(stream, body, abortSignal, {
      allocId,
      correlationId,
    });
  });
});

export default generate;
