import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { GenerateStreamBodySchema } from '../lib/generate-stream-schema.ts';
import { executeGenerateStreamSafe } from '../services/generate-execution.ts';

const generate = new Hono();

generate.post('/', async (c) => {
  const raw = await c.req.json();
  const parsed = GenerateStreamBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }
  const body = parsed.data;

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let id = 0;
    const allocId = () => String(id++);

    await executeGenerateStreamSafe(stream, body, abortSignal, { allocId });
  });
});

export default generate;
