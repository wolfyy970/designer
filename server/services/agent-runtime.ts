/**
 * App-owned agent runtime facade.
 *
 * Server orchestration should import this module instead of Pi-specific service
 * modules. A future Pi SDK upgrade or replacement should be contained behind
 * this boundary while preserving these app contracts.
 */
import type { RunTraceEvent, TodoItem } from '../../src/types/provider.ts';
import type { SkillCatalogEntry } from '../lib/skill-schema.ts';
import type { SessionType } from '../lib/skill-discovery.ts';
import type { ThinkingLevel } from './pi-model.ts';

export interface AgentRunParams {
  systemPrompt: string;
  userPrompt: string;
  providerId: string;
  modelId: string;
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
}

/** Extended session for revision rounds: seeded virtual FS + compaction hint. */
export interface AgentSessionParams extends AgentRunParams {
  /** Drives LLM log source and task observability. */
  sessionType?: SessionType;
  correlationId?: string;
  seedFiles?: Record<string, string>;
  /** @deprecated Pi currently manages compaction; reserved for future runtime hooks. */
  compactionNote?: string;
  initialProgressMessage?: string;
  /** Non-manual skills for this session; drives the model-facing skill catalog. */
  skillCatalog?: SkillCatalogEntry[];
}

export interface DesignAgentSessionResult {
  files: Record<string, string>;
  todos: TodoItem[];
  /** Paths that already received live `file` SSE during this session. */
  emittedFilePaths: string[];
}

export interface AgentRuntimeError {
  message: string;
  cause?: unknown;
}

export type AgentRunEvent =
  | { type: 'activity' | 'progress' | 'code' | 'error'; payload: string }
  | { type: 'thinking'; payload: string; turnId: number }
  | { type: 'file'; path: string; content: string }
  | { type: 'plan'; files: string[] }
  | { type: 'todos'; todos: TodoItem[] }
  | { type: 'skill_activated'; key: string; name: string; description: string }
  | {
      type: 'streaming_tool';
      toolName: string;
      streamedChars: number;
      done: boolean;
      toolPath?: string;
    }
  | { type: 'trace'; trace: RunTraceEvent };

import { runDesignAgentSession as runDesignAgentSessionLegacy } from './pi-agent-service.ts';
import { runDesignAgentSessionViaPackage } from './pi-package-adapter.ts';
import { env } from '../env.ts';

/**
 * Dispatches to the legacy `pi-agent-service` path or the new
 * `@auto-designer/pi` package path based on `PI_INTEGRATION`. The flag
 * supports `legacy` (default), `package`, or `package:design,evaluation`
 * for partial cut-over by session type. Phase 5 of the rebuild deletes
 * this dispatcher and the legacy branch.
 */
export function runDesignAgentSession(
  params: AgentSessionParams,
  onEvent: (event: AgentRunEvent) => void | Promise<void>,
): Promise<DesignAgentSessionResult | null> {
  const flag = env.PI_INTEGRATION;
  if (flag.mode === 'package') {
    if (!flag.types || (params.sessionType && flag.types.has(params.sessionType))) {
      return runDesignAgentSessionViaPackage(params, onEvent);
    }
  }
  return runDesignAgentSessionLegacy(params, onEvent);
}

export type { ThinkingLevel };
