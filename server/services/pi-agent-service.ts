/**
 * Pi coding agent (see `pi-sdk/`) + just-bash virtual project.
 */
import {
  AuthStorage,
  createAgentSession,
  SessionManager,
  type CreateAgentSessionOptions,
  type ToolDefinition,
} from './pi-sdk/index.ts';
import type { RunTraceEvent, TodoItem } from '../../src/types/provider.ts';
import { env } from '../env.ts';
import { debugAgentIngest } from '../lib/debug-agent-ingest.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { wrapPiStreamWithLogging, PI_LLM_LOG_PHASE, mapSessionTypeToLlmLogSource } from './pi-llm-log.ts';
import { getProviderModelContextWindow } from './provider-model-context.ts';
import { buildModel } from './pi-model.ts';
import {
  computeDesignFilesBeyondSeed,
  createAgentBashSandbox,
  extractDesignFiles,
  SANDBOX_PROJECT_ROOT,
} from './agent-bash-sandbox.ts';
import { createSandboxBashTool } from './pi-bash-tool.ts';
import {
  createTodoWriteTool,
  createUseSkillTool,
  createValidateHtmlTool,
  createValidateJsTool,
} from './pi-app-tools.ts';
import { createVirtualPiCodingTools } from './pi-sdk/virtual-tools.ts';
import { subscribePiSessionBridge } from './pi-session-event-bridge.ts';
import { createSandboxResourceLoader } from './sandbox-resource-loader.ts';
import { lastAssistantHasAgentError } from '../lib/pi-message-helpers.ts';
import { runPromptWithUpstreamRetries } from './pi-agent-prompt-retries.ts';
import type {
  AgentRunParams,
  AgentSessionParams,
  AgentRunEvent,
  DesignAgentSessionResult,
} from './pi-agent-run-types.ts';

/** Default max context when registry has no entry (non-LM Studio). */
const FALLBACK_CONTEXT_WINDOW_DEFAULT = 131_072;

/** Emit “Still working…” progress if the model stream is quiet for this long (seconds). */
const IDLE_PROGRESS_GAP_SEC = 18;

/** How often to check stream idleness for progress heartbeats (ms). */
const IDLE_CHECK_MS = 10_000;

/** Dev ingest interval for stall-debug telemetry (ms). */
const STALL_DEBUG_MS = 60_000;

export type { ThinkingLevel } from './pi-model.ts';
export type { AgentRunParams, AgentSessionParams, AgentRunEvent, DesignAgentSessionResult };

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

  const bash = createAgentBashSandbox({
    seedFiles: params.seedFiles,
  });

  const todoState: { current: TodoItem[] } = { current: [] };
  const hasSeed = !!params.seedFiles && Object.keys(params.seedFiles).length > 0;
  const seedFilesSnapshot = params.seedFiles;

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

  let fileEventCount = 0;
  const emittedFilePaths = new Set<string>();
  const onDesignFile = (path: string, content: string) => {
    fileEventCount += 1;
    emittedFilePaths.add(path);
    void onEvent({ type: 'file', path, content });
    void onEvent(
      trace('file_written', `Saved ${path}`, {
        phase: 'building',
        path,
        status: 'success',
      }),
    );
  };
  const virtualPiTools = createVirtualPiCodingTools(bash, onDesignFile);
  const bashTool = createSandboxBashTool(bash, onDesignFile);
  const todoTool = createTodoWriteTool(todoState, (todos) => {
    void onEvent({ type: 'todos', todos });
  });
  const validateJsTool = createValidateJsTool(bash);
  const validateHtmlTool = createValidateHtmlTool(bash);
  const skillCatalog = params.skillCatalog ?? [];
  const useSkillTool = createUseSkillTool(skillCatalog, (payload) => {
    void onEvent({
      type: 'skill_activated',
      key: payload.key,
      name: payload.name,
      description: payload.description,
    });
  });

  const llmTurnLogRef: { current?: string } = {};

  const { getPromptBody: getPromptBodyFn } = await import('../lib/prompt-resolution.ts');
  const { resourceLoader, settingsManager } = await createSandboxResourceLoader({
    systemPrompt: params.systemPrompt.trim(),
    contextWindow,
    getCompactionPromptBody: () => getPromptBodyFn('agent-context-compaction'),
  });

  const { session, modelFallbackMessage } = await createAgentSession({
    authStorage,
    model,
    thinkingLevel: (params.thinkingLevel ?? 'medium') as NonNullable<
      CreateAgentSessionOptions['thinkingLevel']
    >,
    tools: [],
    customTools: [
      ...virtualPiTools,
      bashTool,
      todoTool,
      useSkillTool,
      validateJsTool,
      validateHtmlTool,
    ] as ToolDefinition[],
    sessionManager: SessionManager.inMemory(),
    cwd: SANDBOX_PROJECT_ROOT,
    settingsManager,
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

  const idleTimer = setInterval(() => {
    if (params.signal?.aborted) return;
    const gapSec = Math.floor((Date.now() - streamActivityAt.current) / 1000);
    if (gapSec < IDLE_PROGRESS_GAP_SEC) return;
    void onEvent({
      type: 'progress',
      payload: `Still working… ${gapSec}s since last streamed output`,
    });
  }, IDLE_CHECK_MS);

  const stallDebugTimer = setInterval(() => {
    if (params.signal?.aborted) return;
    const idleSec = Math.floor((Date.now() - streamActivityAt.current) / 1000);
    const isRevision = !!params.compactionNote?.trim();
    debugAgentIngest({
      hypothesisId: 'H6',
      location: 'pi-agent-service.ts:stall_heartbeat',
      message: 'agent session stall heartbeat',
      data: {
        idleSec,
        pendingToolCalls: pendingToolCallsRef.current,
        isRevision,
        userPromptChars: params.userPrompt.length,
        seedFileCount: params.seedFiles ? Object.keys(params.seedFiles).length : 0,
      },
    });
  }, STALL_DEBUG_MS);

  if (env.isDev) {
    const seedKeys = hasSeed ? Object.keys(params.seedFiles!) : [];
    console.debug('[pi-agent] session start', {
      correlationId: params.correlationId,
      provider: params.providerId,
      model: params.modelId,
      contextWindow,
      seedFileCount: seedKeys.length,
      seedFilePaths: seedKeys.slice(0, 20),
      toolCount: virtualPiTools.length + 5,
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
    await onEvent({ type: 'error', payload: `Agent error: ${normalizeError(err)}` });
    return null;
  } finally {
    clearInterval(idleTimer);
    clearInterval(stallDebugTimer);
    unsubscribe();
  }

  const files = await extractDesignFiles(bash);

  const beyondSeed = computeDesignFilesBeyondSeed(files, seedFilesSnapshot);

  if (env.isDev) {
    const seedCount = params.seedFiles ? Object.keys(params.seedFiles).length : 0;
    console.debug('[pi-agent] session complete', {
      correlationId: params.correlationId,
      filesExtracted: Object.keys(files).length,
      beyondSeedCount: Object.keys(beyondSeed).length,
      fileNames: Object.keys(files),
      fileEventsEmitted: fileEventCount,
      hasSeed,
      seedFileCount: seedCount,
      todoCount: todoState.current.length,
      aborted: !!params.signal?.aborted,
      provider: params.providerId,
      model: params.modelId,
    });
  }

  if (Object.keys(beyondSeed).length === 0 && !params.signal?.aborted) {
    if (!lastAssistantHasAgentError(session)) {
      if (env.isDev) {
        console.warn('[pi-agent] agent produced no new or changed design files vs seed (empty beyond-seed)');
      }
      await onEvent({
        type: 'error',
        payload:
          'Agent completed without creating design files in the sandbox. Try a model that supports tool use, or ensure the bash tool runs successfully.',
      });
    }
    return null;
  }

  return {
    files,
    todos: [...todoState.current],
    emittedFilePaths: [...emittedFilePaths],
  };
}
