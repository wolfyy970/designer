/**
 * PI Agent session runner + stable re-exports.
 *
 * `pi-agent-service.ts` and `pi-agent-tools.ts` are the only modules that import
 * `@mariozechner/pi-agent-core`. PI is pre-1.0 (pinned at ~0.58.x); keep upgrades scoped here.
 */
import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { RunTraceEvent, TodoItem } from '../../src/types/provider.ts';
import { PI_AGENT_CONTEXT_WINDOW, PI_LLM_LOG_PHASE } from '../constants/pi-agent.ts';
import { makeLoggedPiStreamFn } from '../lib/pi-llm-log.ts';
import { handlePiAgentSubscribeEvent } from './pi-agent-subscribe-handlers.ts';
import { buildModel, compactWithLLM, type ThinkingLevel } from './pi-agent-compaction.ts';
import {
  makeEditFileTool,
  makeFindTool,
  makeGrepTool,
  makeLsTool,
  makePlanFilesTool,
  makeReadFileTool,
  makeTodoWriteTool,
  makeValidateHtmlTool,
  makeValidateJsTool,
  makeWriteFileTool,
} from './pi-agent-tools.ts';
import { VirtualWorkspace } from './virtual-workspace.ts';
import { getProviderModelContextWindow } from '../lib/provider-model-context.ts';
import { env } from '../env.ts';

// ── Re-exports (stable import surface for orchestrator + tests) ───────────────

export {
  buildModel,
  buildFallbackSummary,
  compactWithLLM,
} from './pi-agent-compaction.ts';
export type { ThinkingLevel } from './pi-agent-compaction.ts';
export {
  makeEditFileTool,
  makeReadFileTool,
  makeLsTool,
  makeFindTool,
  makeTodoWriteTool,
  makeGrepTool,
  makeValidateJsTool,
  makeValidateHtmlTool,
} from './pi-agent-tools.ts';
export { VirtualWorkspace } from './virtual-workspace.ts';
export type { WorkspaceFileSnapshot } from './virtual-workspace.ts';

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
  /** Ties Pi turns and compaction LLM rows to one generate / hypothesis run */
  correlationId?: string;
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
  | { type: 'todos'; todos: TodoItem[] }
  | { type: 'trace'; trace: RunTraceEvent };

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
  const trace = (
    kind: RunTraceEvent['kind'],
    label: string,
    extra: Partial<RunTraceEvent> = {},
  ): AgentRunEvent => ({
    type: 'trace',
    trace: {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      kind,
      label,
      status: 'info',
      ...extra,
    },
  });

  await onEvent({
    type: 'progress',
    payload: params.initialProgressMessage ?? 'Starting agentic generation...',
  });
  await onEvent(
    trace('run_started', params.initialProgressMessage ?? 'Starting agentic generation...', {
      phase: 'building',
    }),
  );

  const workspace = new VirtualWorkspace();
  if (params.virtualSkillFiles) {
    for (const [path, content] of Object.entries(params.virtualSkillFiles)) {
      workspace.seed(path, content);
    }
  }
  if (params.seedFiles) {
    for (const [path, content] of Object.entries(params.seedFiles)) {
      workspace.seed(path, content);
    }
  }

  const todoState: { current: TodoItem[] } = { current: [] };
  const hasSeed = !!params.seedFiles && Object.keys(params.seedFiles).length > 0;

  const registryCw = await getProviderModelContextWindow(
    params.providerId,
    params.modelId,
  );
  const fallbackCw =
    params.providerId === 'lmstudio' ? env.LM_STUDIO_CONTEXT_WINDOW : 131_072;
  const contextWindow = registryCw ?? fallbackCw;
  const model = buildModel(
    params.providerId,
    params.modelId,
    params.thinkingLevel,
    contextWindow,
  );
  const planTool = makePlanFilesTool((files) => {
    void onEvent({ type: 'plan', files });
    void onEvent(
      trace('files_planned', `Planned ${files.length} file${files.length === 1 ? '' : 's'}`, {
        phase: 'building',
        status: 'success',
      }),
    );
  });
  const writeTool = makeWriteFileTool(workspace, (path, content) => {
    void onEvent({ type: 'file', path, content });
    void onEvent(
      trace('file_written', `Saved ${path}`, {
        phase: 'building',
        path,
        status: 'success',
      }),
    );
  });
  const editTool = makeEditFileTool(workspace, (path, content) => {
    void onEvent({ type: 'file', path, content });
    void onEvent(
      trace('file_written', `Updated ${path}`, {
        phase: 'building',
        path,
        status: 'success',
      }),
    );
  });
  const readTool = makeReadFileTool(workspace);
  const lsTool = makeLsTool(workspace);
  const findTool = makeFindTool(workspace);
  const todoTool = makeTodoWriteTool(todoState, (todos) => {
    void onEvent({ type: 'todos', todos });
  });
  const grepTool = makeGrepTool(workspace);
  const validateJsTool = makeValidateJsTool(workspace);
  const validateHtmlTool = makeValidateHtmlTool(workspace);

  const { KEEP_RECENT, COMPACT_THRESHOLD } = PI_AGENT_CONTEXT_WINDOW;

  const compactionExtra = params.compactionNote?.trim()
    ? `[Evaluation / revision context]\n${params.compactionNote.trim()}`
    : undefined;

  const llmTurnLogRef: { current?: string } = {};

  const agent = new Agent({
    streamFn: makeLoggedPiStreamFn({
      providerId: params.providerId,
      modelId: params.modelId,
      source: 'builder',
      phase: params.compactionNote?.trim()
        ? PI_LLM_LOG_PHASE.REVISION
        : PI_LLM_LOG_PHASE.AGENTIC_TURN,
      turnLogRef: llmTurnLogRef,
      correlationId: params.correlationId,
    }),
    initialState: {
      systemPrompt: params.systemPrompt,
      model,
      thinkingLevel: params.thinkingLevel ?? 'off',
      tools: [
        writeTool,
        editTool,
        readTool,
        lsTool,
        findTool,
        grepTool,
        todoTool,
        planTool,
        validateJsTool,
        validateHtmlTool,
      ],
    },
    transformContext: async (messages) => {
      if (messages.length <= COMPACT_THRESHOLD) return messages;

      const first = messages[0];
      const recent = messages.slice(-KEEP_RECENT);
      const toSummarize = messages.slice(1, messages.length - KEEP_RECENT);
      const snapshot = workspace.getFileSnapshot();

      await onEvent({ type: 'progress', payload: 'Compacting context...' });
      await onEvent(
        trace('compaction', 'Compacting context window', {
          phase: 'building',
        }),
      );
      const summaryText = await compactWithLLM(toSummarize, params.providerId, params.modelId, {
        extraContext: compactionExtra,
        snapshot,
        signal: params.signal,
        correlationId: params.correlationId
          ? `${params.correlationId}:compact`
          : undefined,
      });

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

  const subscribeCtx = {
    onEvent,
    trace,
    toolPathByCallId: new Map<string, string | undefined>(),
    waitingForFirstToken: { current: false },
    turnLogRef: llmTurnLogRef,
  };
  agent.subscribe((event) => {
    if (params.signal?.aborted) return;
    handlePiAgentSubscribeEvent(subscribeCtx, event);
  });

  try {
    await agent.prompt(params.userPrompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await onEvent({ type: 'error', payload: `Agent error: ${message}` });
    return null;
  }

  if (!hasSeed && workspace.designPathCount() === 0 && !params.signal?.aborted) {
    await onEvent({
      type: 'error',
      payload:
        'Agent completed without calling write_file. Try a model that supports tool use.',
    });
    return null;
  }

  return {
    files: workspace.entriesForDesignOutput(),
    todos: [...todoState.current],
  };
}
