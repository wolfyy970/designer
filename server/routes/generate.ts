import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { env } from '../env.ts';
import { GenerateStreamBodySchema } from '../lib/generate-stream-schema.ts';
import { executeGenerateStreamSafe } from '../services/generate-execution.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { clampEvaluatorOptional, clampProviderModel } from '../lib/lockdown-model.ts';

const generate = new Hono();

generate.post('/', async (c) => {
  const parsed = await parseRequestJson(c, GenerateStreamBodySchema, {
    devWarnLabel: '[generate]',
  });
  if (!parsed.ok) return parsed.response;
  const m = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const ev = clampEvaluatorOptional(parsed.data.evaluatorProviderId, parsed.data.evaluatorModelId);
  const body = { ...parsed.data, ...ev, providerId: m.providerId, modelId: m.modelId };
  const correlationId =
    body.correlationId?.trim() || crypto.randomUUID();

  if (env.isDev) {
    console.debug('[generate] request', {
      correlationId,
      provider: body.providerId,
      model: body.modelId,
      promptChars: body.prompt.length,
      evalContext: body.evaluationContext === null ? 'build_only' : 'eval',
    });
  }

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
