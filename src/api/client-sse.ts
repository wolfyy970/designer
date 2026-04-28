/**
 * Agentic SSE: hypothesis generate, incubate stream, dispatch helpers.
 */
import type {
  IncubateRequest,
  IncubateResponse,
  HypothesisGenerateApiPayload,
} from './types';
import type { RunTraceEvent, SkillInfo, TodoItem } from '../types/provider';
import type {
  AgenticCheckpoint,
  AgenticPhase,
  EvaluationRoundSnapshot,
  EvaluatorRubricId,
  EvaluatorWorkerReport,
} from '../types/evaluation';
import { normalizeError, parseApiErrorBody } from '../lib/error-utils';
import { SSE_EVENT_NAMES } from '../constants/sse-events';
import { readSseEventStream } from '../lib/sse-reader';
import {
  attachSseDiagWindow,
  createSseStreamDiagnostics,
} from '../lib/sse-diagnostics';
import type { ZodError } from 'zod';
import { IncubateResponseSchema } from './response-schemas';
import { API_BASE, INVALID_SERVER_RESPONSE } from './client-shared.ts';
import {
  callbacksForHypothesisLane,
  finalizeMissingHypothesisLanes,
  notifyAllHypothesisLanesError,
  type HypothesisLaneSession,
} from './client-sse-lane-router';
import { parseHypothesisSseJson, stripLaneIndex } from './client-sse-json';
import { dispatchGenerateStreamEvent } from './client-sse-dispatch';

export { parseHypothesisSseJson } from './client-sse-json';
export {
  dispatchGenerateStreamEvent,
  dispatchParsedAgenticSseEvent,
} from './client-sse-dispatch';

// ── Generate (SSE) ──────────────────────────────────────────────────

export interface GenerateStreamCallbacks {
  onProgress?: (status: string) => void;
  onActivity?: (entry: string) => void;
  /** Model reasoning stream (PI `thinking_delta`), scoped by PI turn id */
  onThinking?: (turnId: number, delta: string) => void;
  /** Pi tool-call arguments streaming (toolcall_*), before tool_execution_start. */
  onStreamingTool?: (
    toolName: string,
    streamedChars: number,
    done: boolean,
    toolPath?: string,
  ) => void;
  onTrace?: (trace: RunTraceEvent) => void;
  onCode?: (code: string) => void;
  onError?: (error: string) => void;
  onFile?: (path: string, content: string) => void;
  onPlan?: (files: string[]) => void;
  onTodos?: (todos: TodoItem[]) => void;
  onPhase?: (phase: AgenticPhase) => void;
  onEvaluationProgress?: (round: number, phase: string, message?: string) => void;
  onEvaluationWorkerDone?: (
    round: number,
    rubric: EvaluatorRubricId,
    report: EvaluatorWorkerReport,
  ) => void;
  onEvaluationReport?: (round: number, snapshot: EvaluationRoundSnapshot) => void;
  onRevisionRound?: (round: number, brief: string) => void;
  /** Non-manual skills in the catalog for this Pi session (may update on revision rounds). */
  onSkillsLoaded?: (skills: SkillInfo[]) => void;
  /** Fired when the agent calls use_skill successfully. */
  onSkillActivated?: (payload: SkillInfo) => void;
  onCheckpoint?: (checkpoint: AgenticCheckpoint) => void;
  onDone?: () => void;
  /** Fired when SSE JSON fails schema validation (wire `event:` name + body). */
  onParseError?: (eventName: string, data: Record<string, unknown>, error: ZodError) => void;
}

// ── Incubate (SSE stream) ───────────────────────────────────────────

export interface IncubateStreamCallbacks {
  onProgress?: (status: string) => void;
  /** Throttled tail of raw model output (incubation JSON). */
  onCode?: (preview: string) => void;
  onIncubateResult?: (plan: IncubateResponse) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

/** Explicit split when both legacy incubate callbacks and agentic stream callbacks are needed. */
export interface IncubateStreamOptions {
  incubate?: IncubateStreamCallbacks;
  agentic?: GenerateStreamCallbacks;
}

function isIncubateStreamOptions(second: unknown): second is IncubateStreamOptions {
  return typeof second === 'object' && second !== null && ('agentic' in second || 'incubate' in second);
}

/** @internal Exported for contract tests. */
export function normalizeIncubateOptions(
  second?: IncubateStreamCallbacks | IncubateStreamOptions,
): IncubateStreamOptions {
  if (!second) return {};
  if (isIncubateStreamOptions(second)) {
    return second;
  }
  return { incubate: second };
}

/**
 * POST /api/incubate — consumes SSE (`progress`, `code`, `incubate_result`, `done`, `error`)
 * plus the same agentic events as design generation when `options.agentic` is set.
 * Resolves with the incubation plan from the final `incubate_result` event.
 */
export async function incubateStream(
  req: IncubateRequest,
  second?: IncubateStreamCallbacks | IncubateStreamOptions,
  third?: AbortSignal,
): Promise<IncubateResponse> {
  const opts = normalizeIncubateOptions(second);
  const signal = third;
  const response = await fetch(`${API_BASE}/incubate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorBody(text));
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  let result: IncubateResponse | undefined;
  let streamError: string | undefined;

  const diag = createSseStreamDiagnostics();
  attachSseDiagWindow(diag);

  try {
    await readSseEventStream(reader, async (currentEvent, raw) => {
      const ev = currentEvent.trim();
      const parsed = parseHypothesisSseJson(raw);

      if (ev === SSE_EVENT_NAMES.error) {
        const msg =
          parsed && typeof parsed.error === 'string'
            ? parsed.error
            : raw.length
              ? raw
              : 'Compilation failed';
        streamError = msg;
        opts.incubate?.onError?.(msg);
        opts.agentic?.onError?.(msg);
        return;
      }

      if (ev === SSE_EVENT_NAMES.incubate_result) {
        if (!parsed) {
          streamError = INVALID_SERVER_RESPONSE;
          opts.incubate?.onError?.(streamError);
          opts.agentic?.onError?.(streamError);
          return;
        }
        const r = IncubateResponseSchema.safeParse(parsed);
        if (!r.success) {
          streamError = INVALID_SERVER_RESPONSE;
          opts.incubate?.onError?.(streamError);
          opts.agentic?.onError?.(streamError);
          if (import.meta.env.DEV) {
            console.warn('[api] incubate SSE incubate_result unexpected shape', r.error.flatten());
          }
          return;
        }
        result = r.data;
        opts.incubate?.onIncubateResult?.(r.data);
        return;
      }

      if (ev === SSE_EVENT_NAMES.done) {
        opts.incubate?.onDone?.();
        opts.agentic?.onDone?.();
        return;
      }

      if (opts.agentic && parsed) {
        const ok = dispatchGenerateStreamEvent(ev, parsed, opts.agentic, diag);
        if (!ok) {
          // Incubate (and other task routes) emit many Pi events before `incubate_result`.
          // A single strict-parse mismatch must not cancel the reader — we still need the final plan.
          if (import.meta.env.DEV) {
            console.warn('[api] incubate SSE: agentic event failed strict parse; continuing', ev);
          }
        }
        return;
      }

      if (ev === SSE_EVENT_NAMES.progress) {
        const status = parsed && typeof parsed.status === 'string' ? parsed.status : undefined;
        if (status) opts.incubate?.onProgress?.(status);
        return;
      }

      if (ev === SSE_EVENT_NAMES.code) {
        const code = parsed && typeof parsed.code === 'string' ? parsed.code : '';
        if (code) opts.incubate?.onCode?.(code);
        return;
      }

      if (import.meta.env.DEV) {
        console.debug('[api] incubate SSE event (dev: not surfaced)', ev, raw);
      }
    });
  } finally {
    diag.logClose();
  }

  if (streamError) {
    throw new Error(normalizeError(streamError, 'Compilation failed'));
  }
  if (!result) {
    throw new Error(INVALID_SERVER_RESPONSE);
  }
  return result;
}

/** Same body as {@link incubateStream} but without per-event callbacks. */
export async function incubate(req: IncubateRequest, signal?: AbortSignal): Promise<IncubateResponse> {
  return incubateStream(req, undefined, signal);
}

/**
 * Multiplexed hypothesis generation: one SSE stream, `laneIndex` on each event (except final `done`).
 */
export async function generateHypothesisStream(
  body: HypothesisGenerateApiPayload,
  lanes: HypothesisLaneSession[],
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/hypothesis/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      normalizeError(parseApiErrorBody(text), 'Generation request failed'),
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const diag = createSseStreamDiagnostics();
  attachSseDiagWindow(diag);

  const finalizedLaneIndices = new Set<number>();

  try {
    await readSseEventStream(reader, async (currentEvent, raw) => {
      let notifyError: GenerateStreamCallbacks | undefined;
      try {
        if (currentEvent.trim() === '') {
          diag.recordDrop('empty_event_name', raw.slice(0, 120));
          return;
        }
        const parsed = parseHypothesisSseJson(raw);
        if (parsed == null) {
          diag.recordDrop('invalid_json', currentEvent);
          if (import.meta.env.DEV) {
            console.warn('[generate SSE] non-object or invalid JSON line', currentEvent);
          }
          notifyAllHypothesisLanesError(
            lanes,
            new Error(`Invalid JSON in SSE event "${currentEvent}"`),
          );
          return false;
        }
        if (currentEvent === SSE_EVENT_NAMES.lane_done) {
          diag.recordReceived(SSE_EVENT_NAMES.lane_done);
          const idx = parsed.laneIndex;
          if (typeof idx === 'number' && lanes[idx]) {
            notifyError = lanes[idx].callbacks;
            finalizedLaneIndices.add(idx);
            await lanes[idx].finalizeAfterStream();
          }
          return;
        }
        if (currentEvent === SSE_EVENT_NAMES.done) {
          diag.recordReceived(SSE_EVENT_NAMES.done);
          return;
        }
        const { laneIndex, rest } = stripLaneIndex(parsed);
        if (
          typeof laneIndex !== 'number' &&
          lanes.length > 1 &&
          currentEvent !== SSE_EVENT_NAMES.done
        ) {
          if (import.meta.env.DEV) {
            console.debug('(sse:diag) laneIndex missing; notifying all lanes', currentEvent);
          }
          notifyAllHypothesisLanesError(
            lanes,
            new Error(`SSE event "${currentEvent}" missing laneIndex (multiplexed stream)`),
          );
          return false;
        }
        const cbs = callbacksForHypothesisLane(lanes, laneIndex);
        if (cbs) {
          notifyError = cbs;
          const ok = dispatchGenerateStreamEvent(currentEvent, rest, cbs, diag);
          if (!ok) return false;
        } else {
          diag.recordDrop('no_callbacks', currentEvent);
        }
      } catch (err) {
        diag.recordDrop('handler_throw', currentEvent);
        if (import.meta.env.DEV) {
          console.warn('[generate SSE] handler error', currentEvent, err);
        }
        if (notifyError) {
          notifyError.onError?.(normalizeError(err));
        } else if (lanes.length > 1) {
          notifyAllHypothesisLanesError(lanes, err);
        } else {
          lanes[0]?.callbacks.onError?.(normalizeError(err));
        }
        return false;
      }
    });
  } finally {
    diag.logClose();
  }

  await finalizeMissingHypothesisLanes(lanes, finalizedLaneIndices);
}

export type { HypothesisLaneSession };
