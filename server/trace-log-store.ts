import { env } from './env.ts';
import { OBSERVABILITY_SCHEMA_VERSION } from './lib/observability-line.ts';
import type { ObservabilityLineTrace } from './lib/observability-line.ts';
import { writeObservabilityLine } from './lib/observability-sink.ts';

const traceLines: ObservabilityLineTrace[] = [];
const traceIdInRing = new Set<string>();

function trimTraceToCap(): void {
  const max = env.LLM_LOG_MAX_ENTRIES;
  while (traceLines.length > max) {
    const dropped = traceLines.shift();
    if (dropped?.payload.event.id) traceIdInRing.delete(String(dropped.payload.event.id));
  }
}

/**
 * Ingest client-forwarded trace events; dedupe by `event.id` within the ring; mirror to NDJSON.
 */
export function appendTraceLines(
  lines: Array<{
    event: Record<string, unknown>;
    correlationId?: string;
    resultId?: string;
  }>,
): void {
  for (const row of lines) {
    const id = row.event.id;
    if (typeof id !== 'string' || !id) continue;
    if (traceIdInRing.has(id)) continue;
    traceIdInRing.add(id);
    const at = row.event.at;
    const ts = typeof at === 'string' && at ? at : new Date().toISOString();
    const line: ObservabilityLineTrace = {
      v: OBSERVABILITY_SCHEMA_VERSION,
      ts,
      type: 'trace',
      payload: {
        event: row.event,
        correlationId: row.correlationId,
        resultId: row.resultId,
      },
    };
    traceLines.push(line);
    writeObservabilityLine(line);
  }
  trimTraceToCap();
}

export function getTraceLogLines(): ObservabilityLineTrace[] {
  return traceLines.map((t) => ({
    ...t,
    payload: {
      ...t.payload,
      event: { ...(t.payload.event as Record<string, unknown>) },
    },
  }));
}

export function clearTraceLogEntries(): void {
  traceLines.length = 0;
  traceIdInRing.clear();
}
