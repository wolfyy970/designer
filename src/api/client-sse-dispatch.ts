import type { ZodError } from 'zod';
import { SSE_EVENT_NAMES } from '../constants/sse-events';
import type { SseStreamDiagnostics } from '../lib/sse-diagnostics';
import { formatZodFlattenDetails, normalizeError } from '../lib/error-utils';
import { safeParseGenerateSSEEvent } from '../lib/generate-sse-event-schema';
import type { GenerateSSEEvent } from './types';
import type { GenerateStreamCallbacks } from './client-sse';

export type { ZodError };

/**
 * Dispatches a Zod-validated agentic SSE payload to callbacks (same as hypothesis generate).
 * Exported for tests and task-stream consumers that parse with `safeParseGenerateSSEEvent`.
 */
export function dispatchParsedAgenticSseEvent(
  event: GenerateSSEEvent,
  callbacks: GenerateStreamCallbacks,
): void {
  switch (event.type) {
    case SSE_EVENT_NAMES.progress:
      callbacks.onProgress?.(event.status);
      break;
    case SSE_EVENT_NAMES.activity:
      callbacks.onActivity?.(event.entry);
      break;
    case SSE_EVENT_NAMES.thinking:
      callbacks.onThinking?.(event.turnId, event.delta);
      break;
    case SSE_EVENT_NAMES.streaming_tool:
      callbacks.onStreamingTool?.(
        event.toolName,
        event.streamedChars,
        event.done,
        event.toolPath,
      );
      break;
    case SSE_EVENT_NAMES.trace:
      callbacks.onTrace?.(event.trace);
      break;
    case SSE_EVENT_NAMES.code:
      callbacks.onCode?.(event.code);
      break;
    case SSE_EVENT_NAMES.error:
      callbacks.onError?.(event.error);
      break;
    case SSE_EVENT_NAMES.file:
      callbacks.onFile?.(event.path, event.content);
      break;
    case SSE_EVENT_NAMES.plan:
      callbacks.onPlan?.(event.files);
      break;
    case SSE_EVENT_NAMES.todos:
      callbacks.onTodos?.(event.todos);
      break;
    case SSE_EVENT_NAMES.phase:
      callbacks.onPhase?.(event.phase);
      break;
    case SSE_EVENT_NAMES.evaluation_progress:
      callbacks.onEvaluationProgress?.(event.round, event.phase, event.message);
      break;
    case SSE_EVENT_NAMES.evaluation_worker_done:
      callbacks.onEvaluationWorkerDone?.(event.round, event.rubric, event.report);
      break;
    case SSE_EVENT_NAMES.evaluation_report:
      callbacks.onEvaluationReport?.(event.round, event.snapshot);
      break;
    case SSE_EVENT_NAMES.revision_round:
      callbacks.onRevisionRound?.(event.round, event.brief);
      break;
    case SSE_EVENT_NAMES.skills_loaded:
      callbacks.onSkillsLoaded?.(event.skills);
      break;
    case SSE_EVENT_NAMES.skill_activated:
      callbacks.onSkillActivated?.({
        key: event.key,
        name: event.name,
        description: event.description,
      });
      break;
    case SSE_EVENT_NAMES.checkpoint:
      callbacks.onCheckpoint?.(event.checkpoint);
      break;
    case SSE_EVENT_NAMES.lane_done:
      break;
    case SSE_EVENT_NAMES.done:
      callbacks.onDone?.();
      break;
  }
}

/** @returns `false` when the stream should not process further events (fatal parse / contract break). */
export function dispatchGenerateStreamEvent(
  currentEvent: string,
  data: Record<string, unknown>,
  callbacks: GenerateStreamCallbacks,
  diag?: SseStreamDiagnostics,
): boolean {
  const result = safeParseGenerateSSEEvent(currentEvent, data);
  if (!result.ok) {
    diag?.recordDrop('zod', currentEvent);
    callbacks.onParseError?.(currentEvent, data, result.error);
    const detail = formatZodFlattenDetails(result.error.flatten());
    const first = result.error.issues[0];
    const suffix = detail || (first ? `: ${first.path.join('.')}: ${first.message}` : '');
    callbacks.onError?.(
      normalizeError(new Error(`Invalid SSE event "${currentEvent}"${suffix}`)),
    );
    if (import.meta.env.DEV) {
      console.warn('[generate SSE] invalid payload', currentEvent, result.error.flatten(), data);
    }
    return false;
  }
  dispatchParsedAgenticSseEvent(result.event, callbacks);
  diag?.recordReceived(currentEvent);
  return true;
}
