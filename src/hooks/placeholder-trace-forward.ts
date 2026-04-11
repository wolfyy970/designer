import { postTraceEvents } from '../api/client';
import type { RunTraceEvent } from '../types/provider';

const TRACE_SERVER_FLUSH_MS = 280;
const TRACE_SERVER_BUFFER_MAX = 200;

export function createPlaceholderTraceForwarder(options: {
  resultId: string;
  correlationId?: string;
}) {
  const { resultId, correlationId } = options;
  let pendingServerTraces: RunTraceEvent[] = [];
  let traceFlushTimer: ReturnType<typeof setTimeout> | null = null;
  let traceForwardWarned = false;

  async function flushTraceToServer(): Promise<void> {
    if (traceFlushTimer != null) {
      clearTimeout(traceFlushTimer);
      traceFlushTimer = null;
    }
    if (pendingServerTraces.length === 0) return;
    const batch = pendingServerTraces.splice(0, pendingServerTraces.length);
    const ok = await postTraceEvents({
      events: batch,
      resultId,
      correlationId,
    });
    if (!ok && batch.length > 0) {
      pendingServerTraces = [...batch, ...pendingServerTraces].slice(-TRACE_SERVER_BUFFER_MAX);
      if (!traceForwardWarned && import.meta.env.DEV) {
        traceForwardWarned = true;
        console.warn(
          '[observability] Trace ingest failed (is the API running?). Events are buffered briefly.',
        );
      }
    }
  }

  function scheduleTraceServerForward(trace: RunTraceEvent): void {
    pendingServerTraces.push(trace);
    if (pendingServerTraces.length > TRACE_SERVER_BUFFER_MAX) {
      pendingServerTraces = pendingServerTraces.slice(-TRACE_SERVER_BUFFER_MAX);
    }
    if (traceFlushTimer != null) clearTimeout(traceFlushTimer);
    traceFlushTimer = setTimeout(() => {
      traceFlushTimer = null;
      void flushTraceToServer();
    }, TRACE_SERVER_FLUSH_MS);
  }

  async function flushAllPending(maxAttempts = 5): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts && pendingServerTraces.length > 0; attempt++) {
      await flushTraceToServer();
    }
  }

  return {
    scheduleTraceServerForward,
    /** Flush any buffered traces (used after stream; also called internally). */
    flushAllPending,
  };
}
