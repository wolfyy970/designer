import { create } from 'zustand';

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
  provider: string;
  providerName?: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedPromptTokens?: number;
  costCredits?: number;
  truncated?: boolean;
  toolCalls?: { name: string; path?: string }[];
  error?: string;
}

interface LogStore {
  entries: LlmLogEntry[];
  addEntry: (entry: Omit<LlmLogEntry, 'id' | 'timestamp'>) => void;
  clear: () => void;
}

export const useLogStore = create<LogStore>()((set) => ({
  entries: [],
  addEntry: (entry) =>
    set((state) => ({
      entries: [
        ...state.entries,
        {
          ...entry,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      ],
    })),
  clear: () => set({ entries: [] }),
}));

/**
 * Standalone function for logging from non-React contexts (services).
 * Avoids hook rules while accessing the same store.
 */
export function logLlmCall(entry: Omit<LlmLogEntry, 'id' | 'timestamp'>): void {
  useLogStore.getState().addEntry(entry);
}
