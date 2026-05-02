/**
 * Package-backed adapter for the new Pi boundary at `@auto-designer/pi`.
 *
 * Surfaces the same `runDesignAgentSession` signature as the legacy
 * `pi-agent-service.ts` so callers don't change. Internally builds a session
 * via the package, then layers the existing host bridge + LLM-log wrap on top
 * of the returned `handle.session` so SSE consumers see the same event stream
 * they get from the legacy path. Phase 5 lifts the bridge + log wrap into the
 * package and removes this adapter.
 */
import { performance } from 'node:perf_hooks';
import {
  DefaultResourceLoader,
  PACKAGE_PROMPTS_DIR,
  PACKAGE_SKILLS_DIR,
  computeDesignFilesBeyondSeed,
  createDesignSession,
  createDesignSystemSession,
  createEvaluationSession,
  createIncubationSession,
  createInputsGenSession,
  createInternalContextSession,
  loadDesignerSystemPrompt,
  type ResourceLoader,
  type SessionHandle,
  type ExtensionFactory,
  type SessionEvent,
  type TodoItem,
} from '@auto-designer/pi';
import type { AgentRunEvent, AgentSessionParams, DesignAgentSessionResult } from './agent-runtime.ts';
import type { RunTraceEvent } from '../../src/types/provider.ts';
import { env } from '../env.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { normalizeProviderError } from '../lib/provider-error-normalize.ts';
import { getProviderModelContextWindow } from './provider-model-context.ts';
import { wrapPiStreamWithLogging, PI_LLM_LOG_PHASE, mapSessionTypeToLlmLogSource } from './pi-llm-log.ts';
import { subscribePiSessionBridge } from './pi-session-event-bridge.ts';

const FALLBACK_CONTEXT_WINDOW_DEFAULT = 131_072;

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

function buildPackageResourceLoader(input: {
  sessionType: string;
  extensionFactories: ExtensionFactory[];
  systemPrompt: string;
  cwd: string;
}): Promise<ResourceLoader> {
  const loader = new DefaultResourceLoader({
    cwd: input.cwd,
    /** Required since Pi 0.72 even when project-local discovery is disabled. */
    agentDir: input.cwd,
    /** Disable project-local discovery — we point at the package's bundled paths instead. */
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    extensionFactories: input.extensionFactories,
    additionalSkillPaths: [PACKAGE_SKILLS_DIR],
    additionalPromptTemplatePaths: [PACKAGE_PROMPTS_DIR],
    systemPrompt: input.systemPrompt,
  });
  return Promise.resolve(loader).then(async (l) => {
    await l.reload();
    return l;
  });
}

export async function runDesignAgentSessionViaPackage(
  params: AgentSessionParams,
  onEvent: (event: AgentRunEvent) => void | Promise<void>,
): Promise<DesignAgentSessionResult | null> {
  // ── Provider config (env-resolved) ────────────────────────────────────────
  if (params.providerId !== 'openrouter' && params.providerId !== 'lmstudio') {
    throw new Error(`PI_INTEGRATION=package: unsupported provider "${params.providerId}"`);
  }
  const provider =
    params.providerId === 'openrouter'
      ? ({
          id: 'openrouter' as const,
          baseUrl: `${env.OPENROUTER_BASE_URL}/api/v1`,
          apiKey: env.OPENROUTER_API_KEY,
        })
      : ({ id: 'lmstudio' as const, baseUrl: env.LMSTUDIO_URL });

  const registryCw = await getProviderModelContextWindow(params.providerId, params.modelId);
  const fallbackCw =
    params.providerId === 'lmstudio' ? env.LM_STUDIO_CONTEXT_WINDOW : FALLBACK_CONTEXT_WINDOW_DEFAULT;
  const contextWindow = registryCw ?? fallbackCw;

  await onEvent({
    type: 'progress',
    payload: params.initialProgressMessage ?? 'Starting agentic generation...',
  });
  await onEvent(
    createTraceEvent('run_started', params.initialProgressMessage ?? 'Starting agentic generation...', {
      phase: 'building',
    }),
  );

  // ── System prompt body (package's bundled designer-agentic-system) ─────────
  const systemPromptBody = (params.systemPrompt?.trim() || loadDesignerSystemPrompt()).trim();

  // ── File / todo emit hooks (host bridge surfacing) ─────────────────────────
  const trace = createTraceEvent;
  const emittedFilePaths = new Set<string>();
  const onFile = (path: string, content: string) => {
    emittedFilePaths.add(path);
    void onEvent({ type: 'file', path, content });
    void onEvent(
      trace('file_written', `Saved ${path}`, { phase: 'building', path, status: 'success' }),
    );
  };
  const onTodos = (todos: TodoItem[]) => {
    void onEvent({ type: 'todos', todos });
  };

  const onPackageEvent = (e: SessionEvent) => {
    if (e.type === 'agent_end' && e.errorMessage) {
      void onEvent({ type: 'error', payload: e.errorMessage });
    }
  };

  // ── Build the package session ──────────────────────────────────────────────
  const baseOpts = {
    provider,
    modelId: params.modelId,
    contextWindow,
    thinkingLevel: params.thinkingLevel,
    systemPrompt: systemPromptBody,
    userPrompt: params.userPrompt,
    signal: params.signal,
    correlationId: params.correlationId,
    onFile,
    onTodos,
    onEvent: onPackageEvent,
    buildResourceLoader: ({
      sessionType,
      extensionFactories,
    }: {
      sessionType: string;
      extensionFactories: ExtensionFactory[];
    }) =>
      buildPackageResourceLoader({
        sessionType,
        extensionFactories,
        systemPrompt: systemPromptBody,
        cwd: '/home/user/project',
      }),
  };
  // Route by session type so the SessionScopedResourceLoader picks the right
  // skill-tag set. Only `design` accepts seedFiles (revision rounds); the rest
  // are zero-seed by contract.
  let handle: SessionHandle;
  switch (params.sessionType) {
    case 'evaluation':
      handle = await createEvaluationSession(baseOpts);
      break;
    case 'incubation':
      handle = await createIncubationSession(baseOpts);
      break;
    case 'inputs-gen':
      handle = await createInputsGenSession(baseOpts);
      break;
    case 'design-system':
      handle = await createDesignSystemSession(baseOpts);
      break;
    case 'internal-context':
      handle = await createInternalContextSession(baseOpts);
      break;
    case 'design':
    default:
      handle = await createDesignSession({ ...baseOpts, seedFiles: params.seedFiles });
      break;
  }

  // ── Wrap streamFn with the host's LLM-log sink ────────────────────────────
  const llmTurnLogRef: { current?: string } = {};
  const prevStream = handle.session.agent.streamFn;
  handle.session.agent.streamFn = wrapPiStreamWithLogging(prevStream, {
    providerId: params.providerId,
    modelId: params.modelId,
    source: mapSessionTypeToLlmLogSource(params.sessionType),
    phase: params.compactionNote?.trim() ? PI_LLM_LOG_PHASE.REVISION : PI_LLM_LOG_PHASE.AGENTIC_TURN,
    turnLogRef: llmTurnLogRef,
    correlationId: params.correlationId,
  });

  // ── Layer the host's rich AgentRunEvent bridge on top ─────────────────────
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
    onStreamDeliveryFailure: () => handle.session.agent.abort(),
  };
  const unsubscribeBridge = subscribePiSessionBridge(handle.session, subscribeCtx);

  // ── Run + map result ──────────────────────────────────────────────────────
  if (env.isDev) {
    const seedKeys = params.seedFiles ? Object.keys(params.seedFiles) : [];
    console.debug('[pi-package-adapter] session start', {
      correlationId: params.correlationId,
      provider: params.providerId,
      model: params.modelId,
      contextWindow,
      seedFileCount: seedKeys.length,
      sessionType: params.sessionType,
    });
  }

  let result;
  try {
    const t0 = performance.now();
    result = await handle.run();
    if (env.isDev) {
      console.debug('[pi-package-adapter] session done', {
        correlationId: params.correlationId,
        durationMs: Math.round(performance.now() - t0),
        fileCount: Object.keys(result.files).length,
        todoCount: result.todos.length,
        aborted: result.aborted,
      });
    }
  } catch (err) {
    if (env.isDev) {
      console.error('[pi-package-adapter] handle.run failed', normalizeError(err), err);
    }
    await onEvent({ type: 'error', payload: `Agent error: ${normalizeProviderError(err)}` });
    return null;
  } finally {
    unsubscribeBridge();
  }

  if (result.errorMessage) {
    await onEvent({ type: 'error', payload: result.errorMessage });
  }

  const seedSnapshot = params.seedFiles;
  const hasRevisionSeed = !!seedSnapshot && Object.keys(seedSnapshot).length > 0;
  const outputVsSeed = hasRevisionSeed
    ? computeDesignFilesBeyondSeed(result.files, seedSnapshot)
    : result.files;

  if (Object.keys(outputVsSeed).length === 0 && !result.aborted) {
    await onEvent({
      type: 'error',
      payload:
        'Agent completed without creating design files in the sandbox. Try a model that supports tool use, or ensure the bash tool runs successfully.',
    });
    return null;
  }

  return {
    files: result.files,
    todos: result.todos,
    emittedFilePaths: result.emittedFilePaths,
  };
}
