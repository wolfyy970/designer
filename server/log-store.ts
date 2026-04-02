import { env } from './env.ts';
import { OBSERVABILITY_SCHEMA_VERSION } from './lib/observability-line.ts';
import { writeObservabilityLine } from './lib/observability-sink.ts';
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
    | 'compiler'
    | 'planner'
    | 'builder'
    | 'designSystem'
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

/** Drop oldest rows when over cap (in-memory dev log only). */
function trimToMaxCap(): void {
  const max = env.LLM_LOG_MAX_ENTRIES;
  while (entries.length > max) entries.shift();
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
  return id;
}

export function appendLlmCallResponse(id: string, chunk: string): void {
  if (!chunk) return;
  const row = entries.find((e) => e.id === id);
  if (!row || row.status !== 'in_progress') return;
  row.response += chunk;
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
}
