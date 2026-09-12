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
  type AgentSession,
  type ExtensionFactory,
  type ResourceLoader,
  createAgentSession,
} from './internal/pi-types.ts';
import {
  createAgentBashSandbox,
  extractDesignFiles,
  SANDBOX_PROJECT_ROOT,
} from './sandbox/virtual-workspace.ts';
import { seedSkillsIntoSandbox } from './sandbox/seed-skills.ts';
import type { Bash } from 'just-bash';
import { buildSandboxedBashTool } from './tools/bash-tool.ts';
import {
  buildSandboxedEditTool,
  buildSandboxedFindTool,
  buildSandboxedGrepTool,
  buildSandboxedLsTool,
  buildSandboxedReadTool,
  buildSandboxedWriteTool,
  createSandboxToolContext,
  type SandboxToolContext,
} from './tools/virtual-tools.ts';
import {
  createTodoWriteTool,
  createValidateArtifactTool,
  createValidateHtmlTool,
  createValidateJsTool,
} from './extension/designer-tools.ts';
import { ToolSurface } from './internal/pi-tool-surface.ts';
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
import { findLastAssistantMessage } from './internal/pi-messages.ts';
import type { TodoItem } from './types.ts';

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
    extensionFactories: ExtensionFactory[];
  }) => Promise<ResourceLoader>;

  /** Optional override for skill-tag lookup (defaults to YAML frontmatter scan). */
  getSkillTags?: SkillTagLookup;

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

/**
 * Declarative tool surface — one entry per model-callable tool, kind tagged.
 * This is the **single source of truth** for the design session's tool
 * allowlist: `createSession` builds it, and `pi-tool-surface.test.ts` asserts
 * against it directly rather than against a replica. A test that rebuilt this
 * list locally would keep passing after a tool was removed here, which is
 * exactly the drift the tripwire exists to catch.
 *
 * `ToolSurface.build()` validates this against upstream Pi's built-in
 * inventory at runtime: if Pi adds a new built-in we haven't dispositioned,
 * session creation throws with an actionable message pointing at this list.
 * See src/internal/pi-tool-surface.ts.
 *
 * Exported for that test's use. Not part of the host-facing session API.
 */
export function buildDesignToolSurface(args: {
  bash: Bash;
  sandboxCtx: SandboxToolContext;
  todoState: { current: TodoItem[] };
  onTodos: (todos: TodoItem[]) => void;
}): ToolSurface {
  const { bash, sandboxCtx, todoState, onTodos } = args;
  return new ToolSurface()
    .add({ kind: 'sandboxed-pi', name: 'read', build: () => buildSandboxedReadTool(sandboxCtx) })
    .add({ kind: 'sandboxed-pi', name: 'write', build: () => buildSandboxedWriteTool(sandboxCtx) })
    .add({ kind: 'sandboxed-pi', name: 'edit', build: () => buildSandboxedEditTool(sandboxCtx) })
    .add({ kind: 'sandboxed-pi', name: 'ls', build: () => buildSandboxedLsTool(sandboxCtx) })
    .add({ kind: 'sandboxed-pi', name: 'find', build: () => buildSandboxedFindTool(sandboxCtx) })
    .add({ kind: 'sandboxed-pi', name: 'grep', build: () => buildSandboxedGrepTool(sandboxCtx) })
    .add({ kind: 'sandboxed-pi', name: 'bash', build: () => buildSandboxedBashTool(sandboxCtx) })
    .add({
      kind: 'auto-designer-extension',
      name: 'todo_write',
      register: (api) => api.registerTool(createTodoWriteTool(todoState, onTodos)),
    })
    .add({
      kind: 'auto-designer-extension',
      name: 'validate_js',
      register: (api) => api.registerTool(createValidateJsTool(bash)),
    })
    .add({
      kind: 'auto-designer-extension',
      name: 'validate_html',
      register: (api) => api.registerTool(createValidateHtmlTool(bash)),
    })
    .add({
      kind: 'auto-designer-extension',
      name: 'validate_artifact',
      register: (api) => api.registerTool(createValidateArtifactTool(bash)),
    });
}

/** Runs the initial prompt, then optional `continue()` rounds for upstream errors Pi auto-retry doesn't match. */
async function runPromptWithUpstreamRetries(
  session: AgentSession,
  userPrompt: string,
): Promise<void> {
  await session.prompt(userPrompt, { expandPromptTemplates: false });

  let attempts = 0;
  while (attempts < MAX_APP_UPSTREAM_RETRIES) {
    const messages = session.agent.state.messages;
    // Shared with event-bridge's `agent_end` handling: the retry decision and
    // the reported run outcome must never disagree about what failed.
    const lastAssistant = findLastAssistantMessage(messages);
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

  /**
   * Tool surface is built by the exported `buildDesignToolSurface` helper so
   * the test suite asserts against this exact list rather than a replica.
   * See that function's doc block.
   */
  const sandboxCtx = createSandboxToolContext(bash, onFile);
  const surface = buildDesignToolSurface({ bash, sandboxCtx, todoState, onTodos });

  const built = surface.build();

  const baseLoader = await opts.buildResourceLoader({
    sessionType: opts.sessionType,
    extensionFactories: [built.extensionFactory],
  });

  const scopedLoader = new SessionScopedResourceLoader(baseLoader, {
    sessionType: opts.sessionType,
    getSkillTags: opts.getSkillTags,
  });
  await scopedLoader.refreshSkills();

  /**
   * Seed each filtered skill's SKILL.md into the VFS and remap the cached
   * skills' filePath/baseDir to the VFS paths. Pi's `formatSkillsForPrompt`
   * prints VFS paths in `<location>`; the sandboxed `read` tool resolves
   * them. No `use_skill` tool, no real-FS escape — Pi's stock skill flow
   * end-to-end through the sandbox.
   */
  const seededRemapping = await seedSkillsIntoSandbox(bash, scopedLoader.getSkills().skills);
  scopedLoader.applyPathRemapping(seededRemapping);

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
    /**
     * `tools:` is the explicit allowlist of names the model can call. Every
     * tool — sandboxed Pi overrides AND auto-designer extensions — was
     * registered through `pi.registerTool` in the extension factory above
     * (the canonical pattern documented in extensions.md "Overriding
     * Built-in Tools" and SDK example 06-extensions.ts). Pi resolves
     * override-by-name in agent-session.js:_refreshToolRegistry, so the
     * built-in `read`/`write`/etc. that touch the real disk are replaced
     * by our VFS-backed versions before the model ever sees them.
     */
    tools: [...built.allowlist],
    sessionManager: SessionManager.inMemory(),
    cwd: SANDBOX_PROJECT_ROOT,
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
