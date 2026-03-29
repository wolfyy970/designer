/**
 * PI Agent session runner + stable re-exports.
 *
 * `pi-agent-service.ts` and `pi-agent-tools.ts` are the only modules that import
 * `@mariozechner/pi-agent-core`. PI is pre-1.0 (pinned at ~0.58.x); keep upgrades scoped here.
 */
import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { TodoItem } from '../../src/types/provider.ts';
import { buildModel, compactWithLLM, type ThinkingLevel } from './pi-agent-compaction.ts';
import {
  makeEditFileTool,
  makeGrepTool,
  makeListFilesTool,
  makePlanFilesTool,
  makeReadFileTool,
  makeTodoWriteTool,
  makeValidateHtmlTool,
  makeValidateJsTool,
  makeWriteFileTool,
} from './pi-agent-tools.ts';

// ── Re-exports (stable import surface for orchestrator + tests) ───────────────

export {
  buildModel,
  buildFallbackSummary,
  compactWithLLM,
} from './pi-agent-compaction.ts';
export type { ThinkingLevel } from './pi-agent-compaction.ts';
export {
  makeEditFileTool,
  makeListFilesTool,
  makeTodoWriteTool,
  makeGrepTool,
  makeValidateJsTool,
  makeValidateHtmlTool,
} from './pi-agent-tools.ts';

// ── Public API types (app-domain only, no PI types cross this boundary) ───────

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
  seedFiles?: Record<string, string>;
  /**
   * Read-only skill files (e.g. under `skills/…`) preloaded before the first turn.
   * Stripped from the returned `files` map so evaluators only see design artifacts.
   */
  virtualSkillFiles?: Record<string, string>;
  /** Appended to compaction summaries so the model retains evaluation context */
  compactionNote?: string;
  /** First progress line (default: initial build message) */
  initialProgressMessage?: string;
}

export interface DesignAgentSessionResult {
  files: Record<string, string>;
  todos: TodoItem[];
}

export type AgentRunEvent =
  | { type: 'activity' | 'progress' | 'code' | 'error'; payload: string }
  | { type: 'file'; path: string; content: string }
  | { type: 'plan'; files: string[] }
  | { type: 'todos'; todos: TodoItem[] };

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run the PI agentic design loop (possibly with seeded files for revision).
 *
 * Returns final file map + todos, or null on error (emitted as `{ type: 'error' }`).
 */
export async function runDesignAgentSession(
  params: AgentSessionParams,
  onEvent: (event: AgentRunEvent) => void | Promise<void>,
): Promise<DesignAgentSessionResult | null> {
  await onEvent({
    type: 'progress',
    payload: params.initialProgressMessage ?? 'Starting agentic generation...',
  });

  const virtualFS = new Map<string, string>();
  if (params.virtualSkillFiles) {
    for (const [path, content] of Object.entries(params.virtualSkillFiles)) {
      virtualFS.set(path, content);
    }
  }
  if (params.seedFiles) {
    for (const [path, content] of Object.entries(params.seedFiles)) {
      virtualFS.set(path, content);
    }
  }

  const todoState: { current: TodoItem[] } = { current: [] };
  const hasSeed = !!params.seedFiles && Object.keys(params.seedFiles).length > 0;

  const model = buildModel(params.providerId, params.modelId, params.thinkingLevel);
  const planTool = makePlanFilesTool((files) => {
    void onEvent({ type: 'plan', files });
  });
  const writeTool = makeWriteFileTool(virtualFS, (path, content) => {
    void onEvent({ type: 'file', path, content });
  });
  const editTool = makeEditFileTool(virtualFS, (path, content) => {
    void onEvent({ type: 'file', path, content });
  });
  const readTool = makeReadFileTool(virtualFS);
  const listTool = makeListFilesTool(virtualFS);
  const todoTool = makeTodoWriteTool(todoState, (todos) => {
    void onEvent({ type: 'todos', todos });
  });
  const grepTool = makeGrepTool(virtualFS);
  const validateJsTool = makeValidateJsTool(virtualFS);
  const validateHtmlTool = makeValidateHtmlTool(virtualFS);

  const KEEP_RECENT = 20;
  const COMPACT_THRESHOLD = 30;

  const compactionExtra = params.compactionNote?.trim()
    ? `[Evaluation / revision context]\n${params.compactionNote.trim()}`
    : undefined;

  const agent = new Agent({
    initialState: {
      systemPrompt: params.systemPrompt,
      model,
      thinkingLevel: params.thinkingLevel ?? 'off',
      tools: [planTool, writeTool, editTool, readTool, listTool, todoTool, grepTool, validateJsTool, validateHtmlTool],
    },
    transformContext: async (messages) => {
      if (messages.length <= COMPACT_THRESHOLD) return messages;

      const first = messages[0];
      const recent = messages.slice(-KEEP_RECENT);
      const toSummarize = messages.slice(1, messages.length - KEEP_RECENT);
      const filesWritten = [...virtualFS.keys()];

      await onEvent({ type: 'progress', payload: 'Compacting context...' });
      const summaryText = await compactWithLLM(
        toSummarize,
        filesWritten,
        params.providerId,
        params.modelId,
        compactionExtra,
      );

      const todoAppendix =
        todoState.current.length > 0
          ? '\n\n[Current todo list at time of compaction]\n' +
            todoState.current
              .map((t) => {
                const icon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '●' : '○';
                return `${icon} [${t.status}] ${t.task}`;
              })
              .join('\n')
          : '';

      const summary: AgentMessage = {
        role: 'user',
        content: `[Context checkpoint]\n${summaryText}${todoAppendix}`,
        timestamp: Date.now(),
      };

      return [first, summary, ...recent];
    },
  });

  if (params.signal) {
    params.signal.addEventListener('abort', () => agent.abort());
  }

  agent.subscribe((event) => {
    if (params.signal?.aborted) return;

    if (event.type === 'turn_start') {
      void onEvent({ type: 'progress', payload: 'Thinking...' });
    } else if (event.type === 'message_update') {
      const e = event.assistantMessageEvent;
      if (e.type === 'text_delta' && e.delta) {
        void onEvent({ type: 'activity', payload: e.delta });
      } else if (e.type === 'thinking_delta' && e.delta) {
        void onEvent({ type: 'activity', payload: e.delta });
      }
    } else if (event.type === 'tool_execution_start') {
      if (event.toolName === 'write_file') {
        const path = (event.args as { path?: string })?.path ?? 'file';
        void onEvent({ type: 'progress', payload: `Writing ${path}...` });
      } else if (event.toolName === 'edit_file') {
        const path = (event.args as { path?: string })?.path ?? 'file';
        void onEvent({ type: 'progress', payload: `Editing ${path}...` });
      } else if (event.toolName === 'grep') {
        const pattern = (event.args as { pattern?: string })?.pattern ?? '';
        void onEvent({ type: 'progress', payload: `Searching for "${pattern}"...` });
      } else if (event.toolName === 'validate_js' || event.toolName === 'validate_html') {
        const path = (event.args as { path?: string })?.path ?? 'file';
        void onEvent({ type: 'progress', payload: `Validating ${path}...` });
      }
    }
  });

  try {
    await agent.prompt(params.userPrompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await onEvent({ type: 'error', payload: `Agent error: ${message}` });
    return null;
  }

  const designPaths = [...virtualFS.keys()].filter((p) => !p.startsWith('skills/'));
  if (!hasSeed && designPaths.length === 0 && !params.signal?.aborted) {
    await onEvent({
      type: 'error',
      payload:
        'Agent completed without calling write_file. Try a model that supports tool use.',
    });
    return null;
  }

  const filesOut: Record<string, string> = {};
  for (const [path, content] of virtualFS.entries()) {
    if (!path.startsWith('skills/')) filesOut[path] = content;
  }

  return {
    files: filesOut,
    todos: [...todoState.current],
  };
}
