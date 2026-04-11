import { Hono } from 'hono';
import { getLogEntries, getTaskLogEntries, clearLogEntries } from '../log-store.ts';
import { appendTraceLines, getTraceLogLines } from '../trace-log-store.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { env } from '../env.ts';
import {
  PostTraceBodySchema,
  runTraceEventIngestSchema,
} from '../lib/run-trace-ingest-schema.ts';

const logs = new Hono();

/** Re-export for contract tests (alias of ingest schema). */
export { runTraceEventIngestSchema as RunTraceEventBodySchema, PostTraceBodySchema };

logs.get('/', (c) => {
  if (!env.isDev) {
    return c.body(null, 404);
  }
  return c.json({
    llm: getLogEntries(),
    trace: getTraceLogLines(),
    task: getTaskLogEntries(),
  });
});

logs.post('/trace', async (c) => {
  if (!env.isDev) {
    return c.body(null, 404);
  }
  const parsed = await parseRequestJson(c, PostTraceBodySchema);
  if (!parsed.ok) return parsed.response;
  const { correlationId, resultId, events } = parsed.data;
  appendTraceLines(
    events.map((event) => ({
      event: event as Record<string, unknown>,
      correlationId,
      resultId,
    })),
  );
  return c.json({ ok: true });
});

logs.delete('/', (c) => {
  if (!env.isDev) {
    return c.body(null, 404);
  }
  clearLogEntries();
  return c.body(null, 204);
});

export default logs;
