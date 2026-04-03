import type { RunTraceEvent, TodoItem } from '../../src/types/provider.ts';
import type { ThinkingLevel } from './pi-model.ts';

export interface AgentRunParams {
  systemPrompt: string;
  userPrompt: string;
  providerId: string;
  modelId: string;
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
}

/** Extended session for revision rounds: seeded virtual FS + compaction hint */
export interface AgentSessionParams extends AgentRunParams {
  correlationId?: string;
  seedFiles?: Record<string, string>;
  virtualSkillFiles?: Record<string, string>;
  /** @deprecated Pi SDK manages compaction; reserved for future custom hooks */
  compactionNote?: string;
  initialProgressMessage?: string;
}

export interface DesignAgentSessionResult {
  files: Record<string, string>;
  todos: TodoItem[];
}

export type AgentRunEvent =
  | { type: 'activity' | 'progress' | 'code' | 'error'; payload: string }
  | { type: 'thinking'; payload: string; turnId: number }
  | { type: 'file'; path: string; content: string }
  | { type: 'plan'; files: string[] }
  | { type: 'todos'; todos: TodoItem[] }
  | { type: 'trace'; trace: RunTraceEvent };
