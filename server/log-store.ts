import { env } from './env.ts';
import { flushAgentLogSnapshotNow, scheduleAgentLogSnapshot } from './lib/agent-log-snapshot.ts';
import { OBSERVABILITY_SCHEMA_VERSION } from './lib/observability-line.ts';
import { writeObservabilityLine } from './lib/observability-sink.ts';
import type { SessionType } from './lib/skill-discovery.ts';
import { clearTraceLogEntries } from './trace-log-store.ts';

export type LlmLogStatus = 'in_progress' | 'complete' | 'error';

export interface LlmLogEntry {
  id: string;
  timestamp: string;
  /** Starts `in_progress` when a call begins (prompts visible); ends `complete` or `error`. */
  status?: LlmLogStatus;
  /** Optional client- or server-issued id to tie rows to one generate / hypothesis run. */
  correlationId?: string;
  source:
    | 'incubator'
    | 'planner'
    | 'builder'
    | 'designSystem'
    | 'inputsGen'
    | 'evaluator'
    | 'agentCompaction'
    | 'other';
  phase?: string;
  model: string;
  /** Provider id, e.g. `openrouter` */
  provider: string;
  /** Human-readable label from registry, e.g. `OpenRouter` */
  providerName?: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  durationMs: number;
  /** OpenAI/OpenRouter-style usage when the provider returns it */
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedPromptTokens?: number;
  /** OpenRouter `usage.cost` (credits) */
  costCredits?: number;
  truncated?: boolean;
  toolCalls?: { name: string; path?: string }[];
  error?: string;
}

const entries: LlmLogEntry[] = [];

/** In-memory mirror of task_result / task_run for GET /api/logs (full resultContent, not truncated). */
export interface TaskLogEntryTaskResult {
  id: string;
  timestamp: string;
  kind: 'task_result';
  correlationId: string;
  sessionType: SessionType;
  resultFile: string;
  resultContent: string;
  sandboxFilePaths: string[];
}

export interface TaskLogEntryTaskRun {
  id: string;
  timestamp: string;
  kind: 'task_run';
  correlationId: string;
  sessionType: SessionType;
  providerId: string;
  modelId: string;
  durationMs: number;
  outcome: 'success' | 'error' | 'no_result';
  resultFile?: string;
  sandboxFileCount: number;
  errorMessage?: string;
}

export interface TaskLogEntryIncubateParsed {
  id: string;
  timestamp: string;
  kind: 'incubate_parsed';
  correlationId: string;
  hypothesisCount: number;
  hypothesisNames: string[];
  firstHypothesisText: string;
  dimensionCount: number;
}

export type TaskLogEntry = TaskLogEntryTaskResult | TaskLogEntryTaskRun | TaskLogEntryIncubateParsed;

const taskLogEntries: TaskLogEntry[] = [];

/** Drop oldest rows when over cap (in-memory dev log only). */
function trimToMaxCap(): void {
  const max = env.LLM_LOG_MAX_ENTRIES;
  while (entries.length > max) entries.shift();
}

function trimTaskLogToCap(): void {
  const max = env.LLM_LOG_MAX_ENTRIES;
  while (taskLogEntries.length > max) taskLogEntries.shift();
}

/** Append after NDJSON task_result (Pi sandbox extraction). */
export function appendTaskResultLogEntry(input: {
  correlationId: string;
  sessionType: SessionType;
  resultFile: string;
  resultContent: string;
  sandboxFilePaths: string[];
}): void {
  const row: TaskLogEntryTaskResult = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    kind: 'task_result',
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    resultFile: input.resultFile,
    resultContent: input.resultContent,
    sandboxFilePaths: input.sandboxFilePaths,
  };
  taskLogEntries.push(row);
  trimTaskLogToCap();
  scheduleAgentLogSnapshot();
}

/** Append after NDJSON task_run (end of executeTaskAgentStream). */
export function appendTaskRunLogEntry(input: {
  correlationId: string;
  sessionType: SessionType;
  providerId: string;
  modelId: string;
  durationMs: number;
  outcome: 'success' | 'error' | 'no_result';
  resultFile?: string;
  sandboxFileCount: number;
  errorMessage?: string;
}): void {
  const row: TaskLogEntryTaskRun = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    kind: 'task_run',
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    providerId: input.providerId,
    modelId: input.modelId,
    durationMs: input.durationMs,
    outcome: input.outcome,
    resultFile: input.resultFile,
    sandboxFileCount: input.sandboxFileCount,
    errorMessage: input.errorMessage,
  };
  taskLogEntries.push(row);
  trimTaskLogToCap();
  scheduleAgentLogSnapshot();
}

export function getTaskLogEntries(): TaskLogEntry[] {
  return taskLogEntries.map((e) => ({ ...e }));
}

export function clearTaskLogEntries(): void {
  taskLogEntries.length = 0;
}

/** Parsed incubation plan before SSE `incubate_result` — mirrors NDJSON `incubate_parsed`. */
export function appendIncubateParsedLogEntry(input: {
  correlationId: string;
  hypothesisCount: number;
  hypothesisNames: string[];
  firstHypothesisText: string;
  dimensionCount: number;
}): void {
  const ts = new Date().toISOString();
  const row: TaskLogEntryIncubateParsed = {
    id: crypto.randomUUID(),
    timestamp: ts,
    kind: 'incubate_parsed',
    correlationId: input.correlationId,
    hypothesisCount: input.hypothesisCount,
    hypothesisNames: input.hypothesisNames,
    firstHypothesisText: input.firstHypothesisText,
    dimensionCount: input.dimensionCount,
  };
  taskLogEntries.push(row);
  trimTaskLogToCap();
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts,
    type: 'incubate_parsed',
    payload: {
      correlationId: input.correlationId,
      hypothesisCount: input.hypothesisCount,
      hypothesisNames: input.hypothesisNames,
      firstHypothesisText: input.firstHypothesisText,
      dimensionCount: input.dimensionCount,
    },
  });
  scheduleAgentLogSnapshot();
}

export function logLlmCall(entry: Omit<LlmLogEntry, 'id' | 'timestamp'>): void {
  const status: LlmLogStatus =
    entry.status ?? (entry.error ? 'error' : 'complete');
  const row: LlmLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    status,
  };
  entries.push(row);
  trimToMaxCap();
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts: row.timestamp,
    type: 'llm',
    payload: { ...row } as Record<string, unknown>,
  });
  scheduleAgentLogSnapshot();
}

/** Create a row as soon as the outbound request is issued (prompts visible while waiting). */
export function beginLlmCall(
  entry: Omit<LlmLogEntry, 'id' | 'timestamp' | 'durationMs' | 'status'>,
): string {
  const id = crypto.randomUUID();
  entries.push({
    ...entry,
    id,
    timestamp: new Date().toISOString(),
    response: entry.response ?? '',
    durationMs: 0,
    status: 'in_progress',
  });
  trimToMaxCap();
  scheduleAgentLogSnapshot();
  return id;
}

export function appendLlmCallResponse(id: string, chunk: string): void {
  if (!chunk) return;
  const row = entries.find((e) => e.id === id);
  if (!row || row.status !== 'in_progress') return;
  row.response += chunk;
}

/** Replace entire `response` for an in-flight row (e.g. first stream chunk after waiting pulse). */
export function setLlmCallResponseBody(id: string, body: string): void {
  const row = entries.find((e) => e.id === id);
  if (!row || row.status !== 'in_progress') return;
  row.response = body;
}

/** Heartbeat text while blocking on the provider (Observability poll sees elapsed time). */
export function setLlmCallWaitingStatus(id: string, message: string): void {
  const row = entries.find((e) => e.id === id);
  if (!row || row.status !== 'in_progress') return;
  row.response = message;
}

export function finalizeLlmCall(
  id: string,
  patch: Partial<Omit<LlmLogEntry, 'id' | 'timestamp' | 'status'>>,
): void {
  const i = entries.findIndex((e) => e.id === id);
  if (i === -1) return;
  const prev = entries[i]!;
  const nextStatus: LlmLogStatus = patch.error ? 'error' : 'complete';
  const finalized: LlmLogEntry = {
    ...prev,
    ...patch,
    id: prev.id,
    timestamp: prev.timestamp,
    status: nextStatus,
  };
  entries[i] = finalized;
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts: finalized.timestamp,
    type: 'llm',
    payload: { ...finalized } as Record<string, unknown>,
  });
  scheduleAgentLogSnapshot();
}

export function failLlmCall(id: string, error: string, durationMs: number): void {
  finalizeLlmCall(id, {
    error,
    durationMs,
    response: entries.find((e) => e.id === id)?.response ?? '',
  });
}

export function getLogEntries(): LlmLogEntry[] {
  return entries.map((e) => ({ ...e }));
}

/** Current `response` text for an open or finalizing row (for Pi stream finalize merge). */
export function getLlmLogResponseSnapshot(id: string): string | undefined {
  return entries.find((e) => e.id === id)?.response;
}

export function clearLogEntries(): void {
  entries.length = 0;
  clearTraceLogEntries();
  clearTaskLogEntries();
  flushAgentLogSnapshotNow();
}
