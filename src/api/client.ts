import type {
  CompileRequest,
  CompileResponse,
  GenerateSSEEvent,
  HypothesisGenerateApiPayload,
  HypothesisPromptBundleResponse,
  ModelsResponse,
  ProviderInfo,
  ObservabilityLogsResponse,
  DesignSystemExtractRequest,
  DesignSystemExtractResponse,
  HypothesisWorkspaceApiPayload,
} from './types';
import type { RunTraceEvent, TodoItem } from '../types/provider';
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
import {
  LOCKDOWN_MODEL_ID,
  LOCKDOWN_MODEL_LABEL,
  LOCKDOWN_PROVIDER_ID,
} from '../lib/lockdown-model';
import type { ZodError, ZodType } from 'zod';
import {
  CompileResponseSchema,
  DesignSystemExtractResponseSchema,
  HypothesisPromptBundleResponseSchema,
  ObservabilityLogsResponseSchema,
  ModelsResponseSchema,
  PromptHistoryListSchema,
  PromptVersionBodySchema,
  ProvidersListResponseSchema,
  AppConfigResponseSchema,
  type AppConfigResponse,
} from './response-schemas';

const API_BASE = '/api';

const INVALID_SERVER_RESPONSE = 'Invalid server response';

async function postParsed<T>(
  path: string,
  body: unknown,
  schema: ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorBody(text));
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(INVALID_SERVER_RESPONSE);
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    if (import.meta.env.DEV) {
      console.warn(`[api] POST ${path} response shape unexpected`, r.error.flatten());
    }
    throw new Error(INVALID_SERVER_RESPONSE);
  }
  return r.data;
}

/** GET helper: on !ok returns `empty`; on invalid JSON or schema mismatch returns `empty` (matches prior loose `json()` usage). */
async function getParsedList<T>(path: string, schema: ZodType<T>, empty: T): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) return empty;
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return empty;
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    if (import.meta.env.DEV) {
      console.warn(`[api] GET ${path} response shape unexpected`, r.error.flatten());
    }
    return empty;
  }
  return r.data;
}

/** Default client assumption until GET /api/config succeeds (matches server: unset LOCKDOWN = locked). */
export function getPlaceholderAppConfig(): AppConfigResponse {
  return {
    lockdown: true,
    lockdownProviderId: LOCKDOWN_PROVIDER_ID,
    lockdownModelId: LOCKDOWN_MODEL_ID,
    lockdownModelLabel: LOCKDOWN_MODEL_LABEL,
  };
}

export async function fetchAppConfig(signal?: AbortSignal): Promise<AppConfigResponse> {
  const response = await fetch(`${API_BASE}/config`, { signal });
  if (!response.ok) {
    throw new Error('Failed to load app config');
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(INVALID_SERVER_RESPONSE);
  }
  const r = AppConfigResponseSchema.safeParse(json);
  if (!r.success) {
    if (import.meta.env.DEV) {
      console.warn('[api] GET /config response shape unexpected', r.error.flatten());
    }
    throw new Error(INVALID_SERVER_RESPONSE);
  }
  return r.data;
}

// ── Compile ─────────────────────────────────────────────────────────

export async function compile(req: CompileRequest): Promise<CompileResponse> {
  return postParsed('/compile', req, CompileResponseSchema);
}

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
  /** Non-manual skills pre-seeded for this Pi session (may update on revision rounds). */
  onSkillsLoaded?: (skills: { key: string; name: string; description: string }[]) => void;
  /** Fired when the agent calls use_skill successfully. */
  onSkillActivated?: (payload: { key: string; name: string; description: string }) => void;
  onCheckpoint?: (checkpoint: AgenticCheckpoint) => void;
  onDone?: () => void;
  /** Fired when SSE JSON fails schema validation (wire `event:` name + body). */
  onParseError?: (eventName: string, data: Record<string, unknown>, error: ZodError) => void;
}

/** Parse hypothesis SSE JSON line; returns null if not a plain object (arrays/primitives rejected). */
function parseHypothesisSseJson(raw: string): Record<string, unknown> | null {
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

/** Internal: assumes `event` already passed `safeParseGenerateSSEEvent`. */
function dispatchParsedGenerateStreamEvent(
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
      callbacks.onTrace?.(event.trace as RunTraceEvent);
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
      callbacks.onEvaluationWorkerDone?.(
        event.round,
        event.rubric,
        event.report as unknown as EvaluatorWorkerReport,
      );
      break;
    case SSE_EVENT_NAMES.evaluation_report:
      callbacks.onEvaluationReport?.(
        event.round,
        event.snapshot as unknown as EvaluationRoundSnapshot,
      );
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
      callbacks.onCheckpoint?.(event.checkpoint as unknown as AgenticCheckpoint);
      break;
    case SSE_EVENT_NAMES.lane_done:
      break;
    case SSE_EVENT_NAMES.done:
      callbacks.onDone?.();
      break;
  }
}

function dispatchGenerateStreamEvent(
  currentEvent: string,
  data: Record<string, unknown>,
  callbacks: GenerateStreamCallbacks,
  diag?: SseStreamDiagnostics,
): void {
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
    return;
  }
  dispatchParsedGenerateStreamEvent(result.event, callbacks);
  diag?.recordReceived(currentEvent);
}

export async function fetchHypothesisPromptBundle(
  body: HypothesisWorkspaceApiPayload,
  signal?: AbortSignal,
): Promise<HypothesisPromptBundleResponse> {
  return postParsed('/hypothesis/prompt-bundle', body, HypothesisPromptBundleResponseSchema, signal);
}

export interface HypothesisLaneSession {
  callbacks: GenerateStreamCallbacks;
  finalizeAfterStream: () => Promise<void>;
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
          lanes[0]?.callbacks.onError?.(
            normalizeError(new Error(`Invalid JSON in SSE event "${currentEvent}"`)),
          );
          return;
        }
        if (currentEvent === SSE_EVENT_NAMES.lane_done) {
          diag.recordReceived(SSE_EVENT_NAMES.lane_done);
          const idx = parsed.laneIndex;
          if (typeof idx === 'number' && lanes[idx]) {
            notifyError = lanes[idx].callbacks;
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
          import.meta.env.DEV &&
          typeof laneIndex !== 'number' &&
          lanes.length > 1 &&
          currentEvent !== SSE_EVENT_NAMES.done
        ) {
          console.debug('[sse:diag] laneIndex missing; using lane 0 fallback', currentEvent);
        }
        const cbs =
          typeof laneIndex === 'number' && lanes[laneIndex]
            ? lanes[laneIndex].callbacks
            : lanes[0]?.callbacks;
        if (cbs) {
          notifyError = cbs;
          dispatchGenerateStreamEvent(currentEvent, rest, cbs, diag);
        } else {
          diag.recordDrop('no_callbacks', currentEvent);
        }
      } catch (err) {
        diag.recordDrop('handler_throw', currentEvent);
        const fallback = lanes[0]?.callbacks;
        (notifyError ?? fallback)?.onError?.(normalizeError(err));
        if (import.meta.env.DEV) {
          console.warn('[generate SSE] handler error', currentEvent, err);
        }
      }
    });
  } finally {
    diag.logClose();
  }
}

// ── Models ──────────────────────────────────────────────────────────

export async function listModels(providerId: string): Promise<ModelsResponse> {
  return getParsedList(`/models/${providerId}`, ModelsResponseSchema, []);
}

export async function listProviders(): Promise<ProviderInfo[]> {
  return getParsedList('/models', ProvidersListResponseSchema, []);
}

// ── Logs ────────────────────────────────────────────────────────────

export async function getLogs(): Promise<ObservabilityLogsResponse> {
  return getParsedList('/logs', ObservabilityLogsResponseSchema, { llm: [], trace: [] });
}

export async function clearLogs(): Promise<void> {
  await fetch(`${API_BASE}/logs`, { method: 'DELETE' });
}

/** Forward run-trace events to the server observability ring (best-effort). */
export async function postTraceEvents(body: {
  correlationId?: string;
  resultId?: string;
  events: RunTraceEvent[];
}): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/logs/trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** GET /api/prompts/:key/history — version metadata only */
export async function fetchPromptHistory(key: string): Promise<{ version: number; createdAt: string }[]> {
  return getParsedList(
    `/prompts/${encodeURIComponent(key)}/history`,
    PromptHistoryListSchema,
    [],
  );
}

/** GET /api/prompts/:key/versions/:version — body for Prompt Studio compare */
export async function fetchPromptVersionBody(
  key: string,
  version: number,
): Promise<{ key: string; version: number; body: string; createdAt: string }> {
  const response = await fetch(
    `${API_BASE}/prompts/${encodeURIComponent(key)}/versions/${version}`,
  );
  const json: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = json as { error?: string };
    throw new Error(err.error ?? `Failed to load prompt version ${version}`);
  }
  return PromptVersionBodySchema.parse(json);
}

// ── Design System ───────────────────────────────────────────────────

export async function extractDesignSystem(
  req: DesignSystemExtractRequest,
): Promise<DesignSystemExtractResponse> {
  return postParsed('/design-system/extract', req, DesignSystemExtractResponseSchema);
}
