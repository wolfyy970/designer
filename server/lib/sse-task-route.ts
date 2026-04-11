/**
 * Shared SSE plumbing for task-agent routes (incubate, inputs-generate, design-system extract).
 * Encapsulates write gate, allocId, success tail (phase complete + done), and error tail (error + done).
 */
import { normalizeError } from '../../src/lib/error-utils.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import { createWriteGate, type WriteGate } from './sse-write-gate.ts';
import { env } from '../env.ts';

/** Same contract as {@link import('../services/generate-execution.ts').SseStreamWriter}. */
export interface TaskSseStreamWriter {
  writeSSE: (opts: { data: string; event: string; id: string }) => void | Promise<void>;
}

export type TaskAgentSseWrite = (event: string, data: Record<string, unknown>) => Promise<void>;

export interface TaskAgentSseContext {
  write: TaskAgentSseWrite;
  allocId: () => string;
  gate: WriteGate;
}

/**
 * Runs `handler` with gated SSE `write`, then emits `phase: complete` and `done` on success,
 * or `error` and `done` if `handler` throws.
 */
export async function runTaskAgentSseBody(
  stream: TaskSseStreamWriter,
  handler: (ctx: TaskAgentSseContext) => Promise<void>,
): Promise<void> {
  let seq = 0;
  const allocId = () => String(seq++);
  const gate = createWriteGate();
  const sseWriteAudit = env.isDev
    ? { byType: {} as Record<string, number>, t0: Date.now() }
    : null;
  const write: TaskAgentSseWrite = async (event, data) => {
    if (sseWriteAudit) sseWriteAudit.byType[event] = (sseWriteAudit.byType[event] ?? 0) + 1;
    const payload = JSON.stringify(data);
    await gate.enqueue(async () => {
      await stream.writeSSE({ data: payload, event, id: allocId() });
    });
  };
  try {
    await handler({ write, allocId, gate });
    await write(SSE_EVENT_NAMES.phase, { phase: 'complete' });
    await write(SSE_EVENT_NAMES.done, {});
  } catch (err) {
    await write(SSE_EVENT_NAMES.error, { error: normalizeError(err) });
    await write(SSE_EVENT_NAMES.done, {});
  }
  if (sseWriteAudit) {
    console.debug('(task:SSE) write summary', {
      byType: sseWriteAudit.byType,
      durationMs: Date.now() - sseWriteAudit.t0,
    });
  }
}
