/**
 * Pi agent runtime — single boundary between the host and `@auto-designer/pi`.
 *
 * Builds a Pi session via the package, then layers the host's event bridge and
 * LLM-log wrap on top of the returned `handle.session` so SSE consumers see
 * the host's `AgentRunEvent` shape and dev-time `/api/logs` records every
 * model turn.
 *
 * The function is composed from three pure helpers (`resolveProviderConfig`,
 * `dispatchSessionFactory`, `mapPackageResult`) so each piece is testable in
 * isolation.
 */
import { performance } from 'node:perf_hooks';
import {
  DefaultResourceLoader,
  PACKAGE_PROMPTS_DIR,
  PACKAGE_SKILLS_DIR,
  SANDBOX_PROJECT_ROOT,
  computeDesignFilesBeyondSeed,
  createDesignSession,
  createDesignSystemSession,
  createEvaluationSession,
  createIncubationSession,
  createInputsGenSession,
  loadDesignerSystemPrompt,
  type ResourceLoader,
  type SessionHandle,
  type ExtensionFactory,
  type SessionEvent,
  type SessionRunResult,
  type TodoItem,
} from '@auto-designer/pi';
import type { AgentRunEvent, AgentSessionParams, DesignAgentSessionResult } from './agent-runtime.ts';
import type { RunTraceEvent } from '../../src/types/provider.ts';
import { env } from '../env.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { normalizeProviderError } from '../lib/provider-error-normalize.ts';
import { FALLBACK_OPENROUTER_CONTEXT_WINDOW } from '../lib/completion-budget.ts';
import { getProviderModelContextWindow } from './provider-model-context.ts';
import { wrapPiStreamWithLogging, PI_LLM_LOG_PHASE, mapSessionTypeToLlmLogSource } from './pi-llm-log.ts';
import { subscribePiSessionBridge } from './pi-session-event-bridge.ts';

const NO_FILES_MESSAGE =
  'Agent completed without creating design files in the sandbox. Try a model that supports tool use, or ensure the bash tool runs successfully.';

/**
 * Stream went silent for too long during an active turn. The streamFn promise
 * resolved (a stream object was returned), but no chunks have been observed
 * for `STREAM_IDLE_LIMIT_MS`. This is the streaming-aware analogue of a
 * fetch-level hang — distinct from `StreamPreStartError` (Promise never
 * resolved) and from a stage-level wall-clock timeout. Surfaces with the
 * idle duration so callers can correlate to the diagnostic logs.
 */
export class StreamIdleError extends Error {
  override readonly name = 'StreamIdleError';
  readonly idleMs: number;
  readonly correlationId: string | undefined;
  constructor(idleMs: number, correlationId?: string) {
    super(
      `Pi session aborted: no stream activity for ${(idleMs / 1000).toFixed(0)}s` +
        (correlationId ? ` (correlationId=${correlationId})` : '') +
        '. Likely a server-side stall mid-stream after the request was accepted.',
    );
    this.idleMs = idleMs;
    this.correlationId = correlationId;
  }
}

/**
 * Stream activity watchdog: aborts the session if no observable streaming
 * event has fired for this long. A working model produces thinking_delta /
 * text_delta events on a millisecond cadence once a turn starts, so a long
 * silence means the connection is dead rather than slow.
 *
 * **Threshold history.** This was 45s, justified by "the pre-first-token
 * thinking window, which on the models we use is typically under 15s and never
 * above ~45s." Measured against the current default (`deepseek/deepseek-v4.1-flash`,
 * OpenRouter) that assumption no longer holds: this model enters long reasoning
 * stretches and produces single calls of 45.6s, 36.9s and 55.5s, generating
 * 10k+ completion tokens from prompts of a few hundred tokens. At 45s the
 * watchdog aborted healthy builds mid-flight, and an aborted build leaves a
 * *partial* artifact (HTML referencing styles.css/app.js that were never
 * written), which renders as an unstyled, broken-looking design.
 *
 * 120s is chosen to clear the slowest turn observed (~56s) with margin while
 * still catching a genuinely dead connection well inside the 800s function
 * limit. Keep this above the p99 turn duration for whatever model is pinned as
 * the default; a model change that invalidates that assumption will resurface
 * as intermittent broken previews rather than as an obvious error.
 */
/** Exported for tests: the idle abort threshold must stay above p99 turn latency. */
export const STREAM_IDLE_LIMIT_MS = 120_000;
const STREAM_IDLE_CHECK_INTERVAL_MS = 3_000;

type ProviderConfig =
  | { id: 'openrouter'; baseUrl: string; apiKey: string }
  | { id: 'lmstudio'; baseUrl: string };

type SessionFactoryOpts = Parameters<typeof createDesignSession>[0];

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Build the typed provider config + resolve the per-model context window.
 * Throws synchronously when the provider id is unsupported (no SSE has been
 * opened yet, so a thrown error is correct).
 */
export async function resolveProviderConfig(
  providerId: string,
  modelId: string,
): Promise<{ provider: ProviderConfig; contextWindow: number }> {
  if (providerId !== 'openrouter' && providerId !== 'lmstudio') {
    throw new Error(`pi-agent-runtime: unsupported provider "${providerId}"`);
  }
  const provider: ProviderConfig =
    providerId === 'openrouter'
      ? {
          id: 'openrouter',
          baseUrl: `${env.OPENROUTER_BASE_URL}/api/v1`,
          apiKey: env.OPENROUTER_API_KEY,
        }
      : { id: 'lmstudio', baseUrl: env.LMSTUDIO_URL };

  const registryCw = await getProviderModelContextWindow(providerId, modelId);
  const fallbackCw =
    providerId === 'lmstudio' ? env.LM_STUDIO_CONTEXT_WINDOW : FALLBACK_OPENROUTER_CONTEXT_WINDOW;
  return { provider, contextWindow: registryCw ?? fallbackCw };
}

/**
 * Pick the right package session factory by session type. Only `design`
 * accepts seedFiles (revision rounds); the rest are zero-seed by contract.
 */
export function dispatchSessionFactory(
  sessionType: AgentSessionParams['sessionType'],
  baseOpts: SessionFactoryOpts,
  seedFiles?: Record<string, string>,
): Promise<SessionHandle> {
  switch (sessionType) {
    case 'evaluation':
      return createEvaluationSession(baseOpts);
    case 'incubation':
      return createIncubationSession(baseOpts);
    case 'inputs-gen':
      return createInputsGenSession(baseOpts);
    case 'design-system':
      return createDesignSystemSession(baseOpts);
    case 'design':
    default:
      return createDesignSession({ ...baseOpts, seedFiles });
  }
}

/**
 * Map a package `SessionRunResult` into the host's outcome shape, taking
 * revision-round seed diffing into account. Pure function — no SSE side
 * effects; the orchestrator decides how to surface `{ ok: false }`.
 */
export type PiRunOutcome =
  | { ok: true; result: DesignAgentSessionResult }
  | { ok: false; reason: 'no_files'; message: string };

export function mapPackageResult(
  result: SessionRunResult,
  seedFiles: Record<string, string> | undefined,
): PiRunOutcome {
  const hasRevisionSeed = !!seedFiles && Object.keys(seedFiles).length > 0;
  const outputVsSeed = hasRevisionSeed
    ? computeDesignFilesBeyondSeed(result.files, seedFiles)
    : result.files;

  if (Object.keys(outputVsSeed).length === 0 && !result.aborted) {
    return { ok: false, reason: 'no_files', message: NO_FILES_MESSAGE };
  }

  return {
    ok: true,
    result: {
      files: result.files,
      todos: result.todos,
      emittedFilePaths: result.emittedFilePaths,
    },
  };
}

// ── Internal: package resource loader ──────────────────────────────────────

function buildPackageResourceLoader(input: {
  systemPrompt: string;
  extensionFactories: ExtensionFactory[];
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

// ── Public entry point ─────────────────────────────────────────────────────

export async function runPiAgentSession(
  params: AgentSessionParams,
  onEvent: (event: AgentRunEvent) => void | Promise<void>,
): Promise<DesignAgentSessionResult | null> {
  // Throws synchronously — no SSE is open yet.
  const { provider, contextWindow } = await resolveProviderConfig(
    params.providerId,
    params.modelId,
  );

  const startMessage = params.initialProgressMessage ?? 'Starting agentic generation...';
  await onEvent({ type: 'progress', payload: startMessage });
  await onEvent(createTraceEvent('run_started', startMessage, { phase: 'building' }));

  const systemPromptBody = (params.systemPrompt?.trim() || loadDesignerSystemPrompt()).trim();

  const onFile = (path: string, content: string) => {
    void onEvent({ type: 'file', path, content });
    void onEvent(
      createTraceEvent('file_written', `Saved ${path}`, {
        phase: 'building',
        path,
        status: 'success',
      }),
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

  const baseOpts: SessionFactoryOpts = {
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
    buildResourceLoader: ({ extensionFactories }) =>
      buildPackageResourceLoader({
        systemPrompt: systemPromptBody,
        extensionFactories,
        cwd: SANDBOX_PROJECT_ROOT,
      }),
  };

  const handle = await dispatchSessionFactory(params.sessionType, baseOpts, params.seedFiles);

  // Wrap streamFn with the host's LLM-log sink. Track in-flight log
  // finalizers so we can drain them before returning — without this, a
  // session that returns within ms of stream end can race the finalize
  // IIFE and lose its log entry.
  const llmTurnLogRef: { current?: string } = {};
  const pendingLogFinalizers = new Set<Promise<void>>();
  const prevStream = handle.session.agent.streamFn;
  handle.session.agent.streamFn = wrapPiStreamWithLogging(prevStream, {
    providerId: params.providerId,
    modelId: params.modelId,
    source: mapSessionTypeToLlmLogSource(params.sessionType),
    phase: params.phase === 'revision' ? PI_LLM_LOG_PHASE.REVISION : PI_LLM_LOG_PHASE.AGENTIC_TURN,
    turnLogRef: llmTurnLogRef,
    correlationId: params.correlationId,
    pendingLogFinalizers,
  });

  // Layer the host's rich AgentRunEvent bridge on top. Keep the bridge ctx
  // bound so the stream-idle watchdog below can read `streamActivityAt`.
  const bridgeCtx = {
    onEvent,
    trace: createTraceEvent,
    toolPathByCallId: new Map<string, string | undefined>(),
    toolArgsByCallId: new Map<string, string | undefined>(),
    waitingForFirstToken: { current: false },
    turnLogRef: llmTurnLogRef,
    streamActivityAt: { current: Date.now() },
    modelTurnId: { current: 0 },
    pendingToolCallsRef: { current: 0 },
    onStreamDeliveryFailure: () => handle.session.agent.abort(),
  };
  const unsubscribeBridge = subscribePiSessionBridge(handle.session, bridgeCtx);

  if (env.isDev) {
    console.debug('[pi-agent-runtime] session start', {
      correlationId: params.correlationId,
      provider: params.providerId,
      model: params.modelId,
      contextWindow,
      seedFileCount: params.seedFiles ? Object.keys(params.seedFiles).length : 0,
      sessionType: params.sessionType,
    });
  }

  /**
   * Stream-idle watchdog: races against handle.run(). Polls
   * `bridgeCtx.streamActivityAt` (bumped on every text/thinking/toolcall delta)
   * and rejects with a typed `StreamIdleError` if the stream goes silent past
   * the limit. We also call `agent.abort()` so handle.run resolves and any
   * in-flight fetch is cancelled — the rejection wins the race because the
   * abort path resolves with `aborted: true`, not throws.
   *
   * Without this, a network-layer hang on the LLM request (observed in
   * cycles 11 and 15) burns wall-clock until the per-stage timeout — which
   * is much coarser. The idle watchdog is the streaming-aware primary
   * signal; the stage timeout is the safety net for cases where the stream
   * never started or the model is in a tool-loop the watchdog can't see.
   */
  let watchdogReject: ((err: Error) => void) | undefined;
  const watchdogPromise = new Promise<never>((_, rej) => {
    watchdogReject = rej;
  });
  const watchdogTimer = setInterval(() => {
    const idleMs = Date.now() - bridgeCtx.streamActivityAt.current;
    if (idleMs > STREAM_IDLE_LIMIT_MS) {
      clearInterval(watchdogTimer);
      if (env.isDev) {
        console.warn('[pi-agent-runtime] stream-idle watchdog firing', {
          correlationId: params.correlationId,
          idleMs,
          modelTurnId: bridgeCtx.modelTurnId.current,
          pendingToolCalls: bridgeCtx.pendingToolCallsRef?.current,
        });
      }
      void handle.session.agent.abort();
      watchdogReject?.(new StreamIdleError(idleMs, params.correlationId));
    }
  }, STREAM_IDLE_CHECK_INTERVAL_MS);

  let result: SessionRunResult;
  try {
    const t0 = performance.now();
    result = await Promise.race([handle.run(), watchdogPromise]);
    if (env.isDev) {
      console.debug('[pi-agent-runtime] session done', {
        correlationId: params.correlationId,
        durationMs: Math.round(performance.now() - t0),
        fileCount: Object.keys(result.files).length,
        todoCount: result.todos.length,
        aborted: result.aborted,
      });
    }
  } catch (err) {
    if (env.isDev) {
      console.error('[pi-agent-runtime] handle.run failed', normalizeError(err), err);
    }
    await onEvent({ type: 'error', payload: `Agent error: ${normalizeProviderError(err)}` });
    if (err instanceof StreamIdleError) {
      throw err;
    }
    return null;
  } finally {
    clearInterval(watchdogTimer);
    unsubscribeBridge();
    // Drain any in-flight log finalizers before returning so log entries
    // are durable on disk before the caller proceeds. The wrapper's
    // fire-and-forget IIFE could otherwise outlive the session and lose
    // its row if the runtime tears down within ms of stream end.
    if (pendingLogFinalizers.size > 0) {
      await Promise.allSettled([...pendingLogFinalizers]);
    }
  }

  if (result.errorMessage) {
    await onEvent({ type: 'error', payload: result.errorMessage });
  }

  const outcome = mapPackageResult(result, params.seedFiles);
  if (!outcome.ok) {
    await onEvent({ type: 'error', payload: outcome.message });
    return null;
  }
  return outcome.result;
}
