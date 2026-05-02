/**
 * Session factories. Each per-session-type factory wires the same underlying runner
 * with a different `SessionType` tag — the only thing the runner uses the tag for
 * is to scope the resource loader's skill filter.
 *
 * The factory signature mirrors the legacy `runDesignAgentSession` semantics, but
 * the runner returns a `SessionHandle` that the caller drives, instead of a
 * fire-and-forget single call.
 */
import {
  AuthStorage,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ResourceLoader,
  type SettingsManager as SettingsManagerType,
  type ToolDefinition,
  createAgentSession,
} from './internal/pi-types.ts';
import {
  createAgentBashSandbox,
  extractDesignFiles,
  SANDBOX_PROJECT_ROOT,
} from './sandbox/virtual-workspace.ts';
import { createSandboxBashTool } from './tools/bash-tool.ts';
import { createVirtualPiCodingTools } from './tools/virtual-tools.ts';
import { createDesignerExtensionFactory } from './extension/designer.ts';
import { type CompactionFocusLoader } from './extension/compaction.ts';
import {
  SessionScopedResourceLoader,
  type SessionType,
  type SkillTagLookup,
} from './resource-loader.ts';
import { subscribeNarrowBridge, type SessionEvent } from './event-bridge.ts';
import { buildModel, type ProviderConfig, type ThinkingLevel } from './model.ts';
import {
  isAppRetryableUpstreamError,
  sleepMs,
} from './internal/upstream-retry.ts';
import type { TodoItem } from './types.ts';

const DEFAULT_KEEP_RECENT_TOKENS = 20_000;
const COMPACTION_RESERVE_FRACTION = 0.28;
const COMPACTION_RESERVE_FLOOR = 24_000;

/** ~72% of context usage before auto-compaction (Pi triggers when tokens > contextWindow − reserveTokens). */
export function compactionReserveTokensForContextWindow(contextWindow: number): number {
  return Math.max(COMPACTION_RESERVE_FLOOR, Math.floor(contextWindow * COMPACTION_RESERVE_FRACTION));
}

export interface SessionRunnerOptions {
  sessionType: SessionType;

  /** Provider + model wiring. */
  provider: ProviderConfig;
  modelId: string;
  contextWindow?: number;
  thinkingLevel?: ThinkingLevel;

  /** Custom system prompt body (e.g. designer-agentic-system). Pi appends current date + cwd. */
  systemPrompt: string;
  /** First user message; the runner appends a workspace-root reminder. */
  userPrompt: string;
  /** Pre-populate the VFS with prior design files (revision rounds). */
  seedFiles?: Record<string, string>;

  /** Per-session abort signal. */
  signal?: AbortSignal;
  /** Optional correlation id, surfaced through events for log/SSE join. */
  correlationId?: string;

  /** ResourceLoader factory: host builds Pi `DefaultResourceLoader` with paths it owns and returns it. */
  buildResourceLoader: (input: {
    sessionType: SessionType;
    settingsManager: SettingsManagerType;
    extensionFactories: ReturnType<typeof createDesignerExtensionFactory>[];
  }) => Promise<ResourceLoader>;

  /** Optional override for skill-tag lookup (defaults to YAML frontmatter scan). */
  getSkillTags?: SkillTagLookup;

  /** Compaction prompt body loader; when provided, the designer extension wires it into Pi's compaction. */
  getCompactionFocus?: CompactionFocusLoader;

  /** Settings construction hook so callers can adjust `keepRecentTokens` / extra factories. */
  buildSettingsManager?: (input: { reserveTokens: number }) => SettingsManagerType;

  /** Event sink — narrow bridge events. */
  onEvent?: (event: SessionEvent) => void | Promise<void>;
  /** File written/changed in the VFS. */
  onFile?: (path: string, content: string) => void;
  /** Latest todo list (full replacement). */
  onTodos?: (todos: TodoItem[]) => void;
}

export interface SessionRunResult {
  /** All design files in the VFS at session end. */
  files: Record<string, string>;
  /** Latest todo list. */
  todos: TodoItem[];
  /** Paths the runner emitted via `onFile` during the session. */
  emittedFilePaths: string[];
  aborted: boolean;
  errorMessage?: string;
}

export interface SessionHandle {
  readonly sessionId: string;
  readonly session: AgentSession;
  /** Run the session to completion. The handle is single-shot. */
  run(): Promise<SessionRunResult>;
  abort(): Promise<void>;
}

const MAX_APP_UPSTREAM_RETRIES = 2;

/** Runs the initial prompt, then optional `continue()` rounds for upstream errors Pi auto-retry doesn't match. */
async function runPromptWithUpstreamRetries(
  session: AgentSession,
  userPrompt: string,
): Promise<void> {
  await session.prompt(userPrompt, { expandPromptTemplates: false });

  let attempts = 0;
  while (attempts < MAX_APP_UPSTREAM_RETRIES) {
    const messages = session.agent.state.messages;
    const lastAssistant = lastAssistantMessage(messages);
    if (!lastAssistant || lastAssistant.stopReason !== 'error') return;
    if (!isAppRetryableUpstreamError(lastAssistant.errorMessage)) return;
    if (session.retryAttempt !== 0) return;

    attempts += 1;
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      session.agent.state.messages = messages.slice(0, -1);
    }
    await sleepMs(2000 * 2 ** (attempts - 1));
    await session.agent.continue();
  }
}

interface AssistantLike {
  role: string;
  stopReason?: string;
  errorMessage?: string;
}
function lastAssistantMessage(messages: unknown): AssistantLike | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && typeof m === 'object' && (m as { role?: unknown }).role === 'assistant') {
      return m as AssistantLike;
    }
  }
  return undefined;
}

export async function createSession(opts: SessionRunnerOptions): Promise<SessionHandle> {
  const bash = createAgentBashSandbox({ seedFiles: opts.seedFiles });

  const todoState: { current: TodoItem[] } = { current: [] };
  const emittedFilePaths = new Set<string>();
  const onFile = (path: string, content: string) => {
    emittedFilePaths.add(path);
    opts.onFile?.(path, content);
  };
  const onTodos = (todos: TodoItem[]) => {
    todoState.current = todos;
    opts.onTodos?.(todos);
  };

  // Each Pi factory returns a strictly-typed ToolDefinition; the array is heterogeneous,
  // so widen via cast — Pi accepts any ToolDefinition[] downstream.
  const customTools = [
    ...createVirtualPiCodingTools(bash, onFile),
    createSandboxBashTool(bash, onFile),
  ] as unknown as ToolDefinition[];

  const reserveTokens = compactionReserveTokensForContextWindow(opts.contextWindow ?? 131_072);
  const settingsManager = opts.buildSettingsManager
    ? opts.buildSettingsManager({ reserveTokens })
    : SettingsManager.inMemory({
        compaction: { enabled: true, reserveTokens, keepRecentTokens: DEFAULT_KEEP_RECENT_TOKENS },
      });

  const designerExtension = createDesignerExtensionFactory({
    bash,
    todoState,
    onTodos,
    getCompactionFocus: opts.getCompactionFocus,
  });

  const baseLoader = await opts.buildResourceLoader({
    sessionType: opts.sessionType,
    settingsManager,
    extensionFactories: [designerExtension],
  });

  const scopedLoader = new SessionScopedResourceLoader(baseLoader, {
    sessionType: opts.sessionType,
    getSkillTags: opts.getSkillTags,
  });
  await scopedLoader.refreshSkills();

  const authStorage = AuthStorage.inMemory();
  if (opts.provider.id === 'openrouter') {
    authStorage.setRuntimeApiKey('openrouter', opts.provider.apiKey);
  } else {
    authStorage.setRuntimeApiKey('lmstudio', 'local');
  }

  const model = buildModel({
    provider: opts.provider,
    modelId: opts.modelId,
    contextWindow: opts.contextWindow,
    thinkingLevel: opts.thinkingLevel,
  });

  const { session } = await createAgentSession({
    authStorage,
    model,
    thinkingLevel: opts.thinkingLevel ?? 'medium',
    tools: [],
    customTools,
    sessionManager: SessionManager.inMemory(),
    cwd: SANDBOX_PROJECT_ROOT,
    settingsManager,
    resourceLoader: scopedLoader,
  });

  const unsubscribe = opts.onEvent
    ? subscribeNarrowBridge(session, { onEvent: opts.onEvent })
    : () => {};

  if (opts.signal) {
    opts.signal.addEventListener('abort', () => void session.agent.abort());
  }

  // Always-on capture for run() result, in addition to caller's onEvent.
  let endResult: { aborted: boolean; errorMessage?: string } = { aborted: false };
  const captureUnsub = subscribeNarrowBridge(session, {
    onEvent: (e) => {
      if (e.type === 'agent_end') {
        endResult = { aborted: e.aborted, errorMessage: e.errorMessage };
      }
    },
  });

  let started = false;
  return {
    sessionId: session.sessionId,
    session,
    abort: async () => {
      await session.agent.abort();
    },
    run: async (): Promise<SessionRunResult> => {
      if (started) throw new Error('SessionHandle.run() is single-shot');
      started = true;
      try {
        const userMessage =
          `${opts.userPrompt}\n\n[Workspace root: ${SANDBOX_PROJECT_ROOT} — use read, write, edit, ls, find, and grep for files; use bash for shell/commands.]`;
        await runPromptWithUpstreamRetries(session, userMessage);
      } finally {
        unsubscribe();
        captureUnsub();
      }

      const files = await extractDesignFiles(bash);
      return {
        files,
        todos: [...todoState.current],
        emittedFilePaths: [...emittedFilePaths],
        aborted: endResult.aborted,
        errorMessage: endResult.errorMessage,
      };
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Session-typed wrappers — each delegates to `createSession` with the right tag.

export type DesignSessionOptions = Omit<SessionRunnerOptions, 'sessionType'>;
export type EvaluationSessionOptions = Omit<SessionRunnerOptions, 'sessionType' | 'seedFiles'>;
export type IncubationSessionOptions = Omit<SessionRunnerOptions, 'sessionType' | 'seedFiles'>;
export type InputsGenSessionOptions = Omit<SessionRunnerOptions, 'sessionType' | 'seedFiles'>;
export type DesignSystemSessionOptions = Omit<SessionRunnerOptions, 'sessionType' | 'seedFiles'>;
export type InternalContextSessionOptions = Omit<SessionRunnerOptions, 'sessionType' | 'seedFiles'>;

export function createDesignSession(opts: DesignSessionOptions): Promise<SessionHandle> {
  return createSession({ ...opts, sessionType: 'design' });
}
export function createEvaluationSession(opts: EvaluationSessionOptions): Promise<SessionHandle> {
  return createSession({ ...opts, sessionType: 'evaluation' });
}
export function createIncubationSession(opts: IncubationSessionOptions): Promise<SessionHandle> {
  return createSession({ ...opts, sessionType: 'incubation' });
}
export function createInputsGenSession(opts: InputsGenSessionOptions): Promise<SessionHandle> {
  return createSession({ ...opts, sessionType: 'inputs-gen' });
}
export function createDesignSystemSession(opts: DesignSystemSessionOptions): Promise<SessionHandle> {
  return createSession({ ...opts, sessionType: 'design-system' });
}
export function createInternalContextSession(
  opts: InternalContextSessionOptions,
): Promise<SessionHandle> {
  return createSession({ ...opts, sessionType: 'internal-context' });
}
