export interface LlmLogEntry {
  id: string;
  timestamp: string;
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

export function logLlmCall(entry: Omit<LlmLogEntry, 'id' | 'timestamp'>): void {
  entries.push({
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });
}

export function getLogEntries(): LlmLogEntry[] {
  return [...entries];
}

export function clearLogEntries(): void {
  entries.length = 0;
}
