/**
 * Agentic SSE: hypothesis generate, incubate stream, dispatch helpers.
 */
import type {
  IncubateRequest,
  IncubateResponse,
  GenerateSSEEvent,
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
import { formatZodFlattenDetails, normalizeError, parseApiErrorBody } from '../lib/error-utils';
import { safeParseGenerateSSEEvent } from '../lib/generate-sse-event-schema';
import { SSE_EVENT_NAMES } from '../constants/sse-events';
import { readSseEventStream } from '../lib/sse-reader';
import {
  attachSseDiagWindow,
  createSseStreamDiagnostics,
  type SseStreamDiagnostics,
} from '../lib/sse-diagnostics';
import type { ZodError } from 'zod';
import { IncubateResponseSchema } from './response-schemas';
import { API_BASE, INVALID_SERVER_RESPONSE } from './client-shared.ts';

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

/** Parse hypothesis SSE JSON line; returns null if not a plain object (arrays/primitives rejected). */
export function parseHypothesisSseJson(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* dev warning in caller */
  }
  return null;
}

/** Remove server multiplex field before building typed SSE events. */
function stripLaneIndex(data: Record<string, unknown>): {
  laneIndex?: number;
  rest: Record<string, unknown>;
} {
  const laneIndex = data.laneIndex;
  const rest = { ...data };
  delete rest.laneIndex;
  return {
    laneIndex: typeof laneIndex === 'number' ? laneIndex : undefined,
    rest,
  };
}

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

export interface HypothesisLaneSession {
  callbacks: GenerateStreamCallbacks;
  finalizeAfterStream: () => Promise<void>;
}

/** Stream-level SSE failure: every active lane gets the same error (avoids mis-attributing to lane 0). */
function notifyAllHypothesisLanesError(
  lanes: HypothesisLaneSession[],
  err: unknown,
): void {
  const msg = normalizeError(err);
  for (const lane of lanes) {
    lane.callbacks.onError?.(msg);
  }
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
        const cbs =
          typeof laneIndex === 'number' && lanes[laneIndex]
            ? lanes[laneIndex].callbacks
            : lanes[0]?.callbacks;
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

  for (let i = 0; i < lanes.length; i++) {
    if (!finalizedLaneIndices.has(i)) {
      try {
        await lanes[i].finalizeAfterStream();
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[generate SSE] finalize after stream end (missing lane_done)', i, err);
        }
        lanes[i].callbacks.onError?.(
          normalizeError(
            err instanceof Error ? err : new Error('Stream ended before lane completed'),
            'Generation stream ended unexpectedly',
          ),
        );
      }
    }
  }
}
