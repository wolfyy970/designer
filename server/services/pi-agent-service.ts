/**
 * Pi coding agent (see `pi-sdk/`) + just-bash virtual project.
 */
import {
  AuthStorage,
  createAgentSession,
  emitEvent,
  SessionManager,
  type CreateAgentSessionOptions,
  type ToolDefinition,
} from './pi-sdk/index.ts';
import type { RunTraceEvent, TodoItem } from '../../src/types/provider.ts';
import { env } from '../env.ts';
import { debugAgentIngest } from '../lib/debug-agent-ingest.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { normalizeProviderError } from '../lib/provider-error-normalize.ts';
import { wrapPiStreamWithLogging, PI_LLM_LOG_PHASE, mapSessionTypeToLlmLogSource } from './pi-llm-log.ts';
import { getProviderModelContextWindow } from './provider-model-context.ts';
import { buildModel } from './pi-model.ts';
import {
  computeDesignFilesBeyondSeed,
  createAgentBashSandbox,
  extractDesignFiles,
  SANDBOX_PROJECT_ROOT,
} from './virtual-workspace.ts';
import { buildAgentToolGroups, flattenAgentToolGroups } from './agent-tool-registry.ts';
import { subscribePiSessionBridge } from './pi-session-event-bridge.ts';
import { createSandboxResourceLoader } from './sandbox-resource-loader.ts';
import { lastAssistantHasAgentError } from '../lib/pi-message-helpers.ts';
import { runPromptWithUpstreamRetries } from './pi-agent-prompt-retries.ts';
import type { AgentRunEvent, AgentSessionParams, DesignAgentSessionResult } from './agent-runtime.ts';

/** Default max context when registry has no entry (non-LM Studio). */
const FALLBACK_CONTEXT_WINDOW_DEFAULT = 131_072;

/** Emit “Still working…” progress if the model stream is quiet for this long (seconds). */
const IDLE_PROGRESS_GAP_SEC = 18;

/** How often to check stream idleness for progress heartbeats (ms). */
const IDLE_CHECK_MS = 10_000;

/** Dev ingest interval for stall-debug telemetry (ms). */
const STALL_DEBUG_MS = 60_000;

export type { ThinkingLevel } from './pi-model.ts';
export type { AgentSessionParams, AgentRunEvent, DesignAgentSessionResult };

type AgentEventSink = (event: AgentRunEvent) => void | Promise<void>;
type TraceFactory = (
  kind: RunTraceEvent['kind'],
  label: string,
  extra?: Partial<RunTraceEvent>,
) => AgentRunEvent;

function createTraceEvent(
  kind: RunTraceEvent['kind'],
  label: string,
  extra: Partial<RunTraceEvent> = {},
): AgentRunEvent {
  return {
    type: 'trace',
    trace: {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      kind,
      label,
      status: 'info',
      ...extra,
    },
  };
}

async function emitSessionStart(params: AgentSessionParams, onEvent: AgentEventSink): Promise<void> {
  const message = params.initialProgressMessage ?? 'Starting agentic generation...';
  await onEvent({ type: 'progress', payload: message });
  await onEvent(createTraceEvent('run_started', message, { phase: 'building' }));
}

async function buildPiModelRuntime(params: AgentSessionParams): Promise<{
  authStorage: AuthStorage;
  contextWindow: number;
  model: ReturnType<typeof buildModel>;
}> {
  const registryCw = await getProviderModelContextWindow(params.providerId, params.modelId);
  const fallbackCw =
    params.providerId === 'lmstudio' ? env.LM_STUDIO_CONTEXT_WINDOW : FALLBACK_CONTEXT_WINDOW_DEFAULT;
  const contextWindow = registryCw ?? fallbackCw;
  const model = buildModel(
    params.providerId,
    params.modelId,
    params.thinkingLevel,
    contextWindow,
  );

  const authStorage = AuthStorage.inMemory();
  if (params.providerId === 'lmstudio') {
    authStorage.setRuntimeApiKey('lmstudio', 'local');
  }
  if (params.providerId === 'openrouter' && env.OPENROUTER_API_KEY) {
    authStorage.setRuntimeApiKey('openrouter', env.OPENROUTER_API_KEY);
  }

  return { authStorage, contextWindow, model };
}

function createDesignFileEmitter(onEvent: AgentEventSink, trace: TraceFactory): {
  emittedFilePaths: Set<string>;
  getFileEventCount: () => number;
  onDesignFile: (path: string, content: string) => void;
} {
  let fileEventCount = 0;
  const emittedFilePaths = new Set<string>();
  return {
    emittedFilePaths,
    getFileEventCount: () => fileEventCount,
    onDesignFile: (path, content) => {
      fileEventCount += 1;
      emittedFilePaths.add(path);
      emitEvent(onEvent, { type: 'file', path, content });
      emitEvent(
        onEvent,
        trace('file_written', `Saved ${path}`, {
          phase: 'building',
          path,
          status: 'success',
        }),
      );
    },
  };
}

async function createSandboxSessionResources(params: AgentSessionParams) {
  return createSandboxResourceLoader({
    systemPrompt: params.systemPrompt.trim(),
  });
}

function startSessionHeartbeatTimers(input: {
  params: AgentSessionParams;
  onEvent: AgentEventSink;
  streamActivityAt: { current: number };
  pendingToolCallsRef: { current: number };
}): () => void {
  const idleTimer = setInterval(() => {
    if (input.params.signal?.aborted) return;
    const gapSec = Math.floor((Date.now() - input.streamActivityAt.current) / 1000);
    if (gapSec < IDLE_PROGRESS_GAP_SEC) return;
    emitEvent(input.onEvent, {
      type: 'progress',
      payload: `Still working… ${gapSec}s since last streamed output`,
    });
  }, IDLE_CHECK_MS);

  const stallDebugTimer = setInterval(() => {
    if (input.params.signal?.aborted) return;
    const idleSec = Math.floor((Date.now() - input.streamActivityAt.current) / 1000);
    const isRevision = !!input.params.compactionNote?.trim();
    debugAgentIngest({
      hypothesisId: 'H6',
      location: 'pi-agent-service.ts:stall_heartbeat',
      message: 'agent session stall heartbeat',
      data: {
        idleSec,
        pendingToolCalls: input.pendingToolCallsRef.current,
        isRevision,
        userPromptChars: input.params.userPrompt.length,
        seedFileCount: input.params.seedFiles ? Object.keys(input.params.seedFiles).length : 0,
      },
    });
  }, STALL_DEBUG_MS);

  return () => {
    clearInterval(idleTimer);
    clearInterval(stallDebugTimer);
  };
}

async function extractSessionResult(input: {
  bash: ReturnType<typeof createAgentBashSandbox>;
  params: AgentSessionParams;
  session: Awaited<ReturnType<typeof createAgentSession>>['session'];
  todoState: { current: TodoItem[] };
  emittedFilePaths: Set<string>;
  fileEventCount: number;
  contextWindow: number;
  onEvent: AgentEventSink;
}): Promise<DesignAgentSessionResult | null> {
  const files = await extractDesignFiles(input.bash);

  const seedSnapshot = input.params.seedFiles;
  const hasRevisionSeed = !!seedSnapshot && Object.keys(seedSnapshot).length > 0;
  /** With no pre-seeded files, the sandbox should only contain agent output. With revision seeds, compare to detect no net new work. */
  const outputVsSeed = hasRevisionSeed
    ? computeDesignFilesBeyondSeed(files, seedSnapshot)
    : files;

  if (env.isDev) {
    const seedCount = input.params.seedFiles ? Object.keys(input.params.seedFiles).length : 0;
    console.debug('[pi-agent] session complete', {
      correlationId: input.params.correlationId,
      filesExtracted: Object.keys(files).length,
      beyondSeedCount: Object.keys(outputVsSeed).length,
      fileNames: Object.keys(files),
      fileEventsEmitted: input.fileEventCount,
      hasSeed: !!input.params.seedFiles && Object.keys(input.params.seedFiles).length > 0,
      seedFileCount: seedCount,
      todoCount: input.todoState.current.length,
      aborted: !!input.params.signal?.aborted,
      provider: input.params.providerId,
      model: input.params.modelId,
      contextWindow: input.contextWindow,
    });
  }

  if (Object.keys(outputVsSeed).length === 0 && !input.params.signal?.aborted) {
    if (!lastAssistantHasAgentError(input.session)) {
      if (env.isDev) {
        console.warn(
          '[pi-agent] agent produced no new or changed files vs seed (empty workspace or unchanged revision seed)',
        );
      }
      await input.onEvent({
        type: 'error',
        payload:
          'Agent completed without creating design files in the sandbox. Try a model that supports tool use, or ensure the bash tool runs successfully.',
      });
    }
    return null;
  }

  return {
    files,
    todos: [...input.todoState.current],
    emittedFilePaths: [...input.emittedFilePaths],
  };
}

export async function runDesignAgentSession(
  params: AgentSessionParams,
  onEvent: (event: AgentRunEvent) => void | Promise<void>,
): Promise<DesignAgentSessionResult | null> {
  const trace = createTraceEvent;
  await emitSessionStart(params, onEvent);

  const bash = createAgentBashSandbox({
    seedFiles: params.seedFiles,
  });

  const todoState: { current: TodoItem[] } = { current: [] };
  const hasSeed = !!params.seedFiles && Object.keys(params.seedFiles).length > 0;

  const { authStorage, contextWindow, model } = await buildPiModelRuntime(params);
  const { emittedFilePaths, getFileEventCount, onDesignFile } = createDesignFileEmitter(onEvent, trace);
  const skillCatalog = params.skillCatalog ?? [];
  const toolGroups = buildAgentToolGroups({
    bash,
    todoState,
    skillCatalog,
    onDesignFile,
    onTodos: (todos) => {
      emitEvent(onEvent, { type: 'todos', todos });
    },
    onSkillActivated: (payload) => {
      emitEvent(onEvent, {
        type: 'skill_activated',
        key: payload.key,
        name: payload.name,
        description: payload.description,
      });
    },
  });
  const customTools = flattenAgentToolGroups(toolGroups);

  const llmTurnLogRef: { current?: string } = {};

  const { resourceLoader } = await createSandboxSessionResources(params);

  const { session, modelFallbackMessage } = await createAgentSession({
    authStorage,
    model,
    thinkingLevel: (params.thinkingLevel ?? 'medium') as NonNullable<
      CreateAgentSessionOptions['thinkingLevel']
    >,
    /**
     * Pi 0.72 changed `tools: []` semantics: empty array = allowlist of size zero, which
     * filters out customTools too. To suppress Pi's host-touching built-ins (read/write/
     * edit/bash) while keeping our VFS-backed customTools, allowlist the customTool names
     * explicitly.
     */
    tools: customTools.map((t) => t.name),
    customTools: customTools as ToolDefinition[],
    sessionManager: SessionManager.inMemory(),
    cwd: SANDBOX_PROJECT_ROOT,
    resourceLoader,
  });

  if (modelFallbackMessage && process.env.NODE_ENV !== 'production') {
    console.warn('[pi-agent-service]', modelFallbackMessage);
  }

  const prevStream = session.agent.streamFn;
  session.agent.streamFn = wrapPiStreamWithLogging(prevStream, {
    providerId: params.providerId,
    modelId: params.modelId,
    source: mapSessionTypeToLlmLogSource(params.sessionType),
    phase: params.compactionNote?.trim() ? PI_LLM_LOG_PHASE.REVISION : PI_LLM_LOG_PHASE.AGENTIC_TURN,
    turnLogRef: llmTurnLogRef,
    correlationId: params.correlationId,
  });

  const streamActivityAt = { current: Date.now() };
  const pendingToolCallsRef = { current: 0 };
  const subscribeCtx = {
    onEvent,
    trace,
    toolPathByCallId: new Map<string, string | undefined>(),
    toolArgsByCallId: new Map<string, string | undefined>(),
    waitingForFirstToken: { current: false },
    turnLogRef: llmTurnLogRef,
    streamActivityAt,
    modelTurnId: { current: 0 },
    pendingToolCallsRef,
    onStreamDeliveryFailure: () => session.agent.abort(),
  };
  const unsubscribe = subscribePiSessionBridge(session, subscribeCtx);

  if (params.signal) {
    params.signal.addEventListener('abort', () => session.agent.abort());
  }

  const stopHeartbeatTimers = startSessionHeartbeatTimers({
    params,
    onEvent,
    streamActivityAt,
    pendingToolCallsRef,
  });

  if (env.isDev) {
    const seedKeys = hasSeed ? Object.keys(params.seedFiles!) : [];
    console.debug('[pi-agent] session start', {
      correlationId: params.correlationId,
      provider: params.providerId,
      model: params.modelId,
      contextWindow,
      seedFileCount: seedKeys.length,
      seedFilePaths: seedKeys.slice(0, 20),
      toolCount: customTools.length,
      userPromptChars: params.userPrompt.length,
      systemPromptChars: params.systemPrompt.length,
    });
  }

  try {
    await runPromptWithUpstreamRetries(
      session,
      `${params.userPrompt}\n\n[Workspace root: ${SANDBOX_PROJECT_ROOT} — use read, write, edit, ls, find, and grep for files; use bash for shell/commands.]`,
      onEvent,
      trace,
    );
  } catch (err) {
    if (env.isDev) {
      console.error('[pi-agent] session.prompt failed', normalizeError(err), err);
    }
    await onEvent({ type: 'error', payload: `Agent error: ${normalizeProviderError(err)}` });
    return null;
  } finally {
    stopHeartbeatTimers();
    unsubscribe();
  }

  return extractSessionResult({
    bash,
    params,
    session,
    todoState,
    emittedFilePaths,
    fileEventCount: getFileEventCount(),
    contextWindow,
    onEvent,
  });
}
