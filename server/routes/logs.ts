import { Hono } from 'hono';
import { z } from 'zod';
import { getLogEntries, getTaskLogEntries, clearLogEntries } from '../log-store.ts';
import { appendTraceLines, getTraceLogLines } from '../trace-log-store.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { env } from '../env.ts';

const logs = new Hono();

export const RunTraceEventBodySchema = z
  .object({
    id: z.string(),
    at: z.string(),
    kind: z.string(),
    label: z.string(),
    phase: z.string().optional(),
    round: z.number().optional(),
    toolName: z.string().optional(),
    path: z.string().optional(),
    status: z.enum(['info', 'success', 'warning', 'error']).optional(),
  })
  .passthrough();

/** Exported for contract tests; kept in sync with POST /api/logs/trace. */
export const PostTraceBodySchema = z.object({
  correlationId: z.string().optional(),
  resultId: z.string().optional(),
  events: z.array(RunTraceEventBodySchema),
});

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
