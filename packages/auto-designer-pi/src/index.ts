/**
 * Public API for the auto-designer Pi boundary.
 *
 * Phase 1 (skeleton): factory placeholders that throw NotImplementedError.
 * Phase 2a (this commit): VFS sandbox + Pi-native tool builders ported into the package.
 * Phase 2b/2c (next): resource-loader wrapper, designer extension, compaction handler,
 * session host. Until those land, the legacy path under server/services/pi-* still
 * serves every session.
 */

// ────────────────────────────────────────────────────────────────────────────
// VFS sandbox

export {
  SANDBOX_PROJECT_ROOT,
  sandboxProjectAbsPath,
  buildSandboxSeedMaps,
  createAgentBashSandbox,
  extractDesignFiles,
  computeDesignFilesBeyondSeed,
  snapshotDesignFiles,
  type AgentBashSandboxOptions,
} from './sandbox/virtual-workspace.ts';

// ────────────────────────────────────────────────────────────────────────────
// Tools

export { createVirtualPiCodingTools } from './tools/virtual-tools.ts';
export { createSandboxBashTool } from './tools/bash-tool.ts';
export { SANDBOX_TOOL_OVERRIDES } from './tools/sandbox-overrides.ts';
export {
  attemptMatchCascade,
  isEditNotFoundError,
  normalizeEditToolParams,
  strategy1LeadingWhitespaceOnly,
  strategy2CollapsedWhitespace,
  strategy3LineTrimAnchors,
  strategy4CaseInsensitiveCollapsed,
  strategy5AnchorLines,
  type CascadeEdit,
  type CascadeDiagnostic,
} from './tools/edit-match-cascade.ts';

// ────────────────────────────────────────────────────────────────────────────
// Pi SDK re-exports (single import boundary)

export type {
  AgentSession,
  AgentSessionEvent,
  CreateAgentSessionOptions,
  AgentToolResult,
  AgentToolUpdateCallback,
  GrepToolDetails,
  ResourceLoader,
  ToolDefinition,
  ExtensionContext,
  ExtensionAPI,
  ExtensionFactory,
  PromptOptions,
} from './internal/pi-types.ts';
export {
  AuthStorage,
  compact,
  createAgentSession,
  createExtensionRuntime,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from './internal/pi-types.ts';

// ────────────────────────────────────────────────────────────────────────────
// Limits

export { SANDBOX_LIMITS, SANDBOX_READ_MAX_LINES, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from './internal/limits.ts';

// ────────────────────────────────────────────────────────────────────────────
// Phase 1 placeholder factories — replaced in Phase 2c

export const NOT_IMPLEMENTED = 'auto-designer-pi: factory not implemented yet (Phase 2c)';

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method}: ${NOT_IMPLEMENTED}`);
    this.name = 'NotImplementedError';
  }
}

export type SessionType =
  | 'design'
  | 'evaluation'
  | 'incubation'
  | 'inputs-gen'
  | 'design-system'
  | 'internal-context';

export interface BaseSessionOptions {
  providerId: string;
  modelId: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  cwd?: string;
  signal?: AbortSignal;
  correlationId?: string;
}

export interface DesignSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
  seedFiles?: Record<string, string>;
}

export interface EvaluationSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
}

export interface IncubationSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
}

export interface InputsGenSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
}

export interface DesignSystemSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
}

export interface InternalContextSessionOptions extends BaseSessionOptions {
  systemPrompt: string;
  userPrompt: string;
}

export interface SessionHandle<TEvent = unknown, TResult = unknown> {
  readonly sessionId: string;
  subscribe(listener: (event: TEvent) => void | Promise<void>): () => void;
  run(): Promise<TResult>;
  abort(): Promise<void>;
}

export function createDesignSession(_opts: DesignSessionOptions): Promise<SessionHandle> {
  throw new NotImplementedError('createDesignSession');
}

export function createEvaluationSession(_opts: EvaluationSessionOptions): Promise<SessionHandle> {
  throw new NotImplementedError('createEvaluationSession');
}

export function createIncubationSession(_opts: IncubationSessionOptions): Promise<SessionHandle> {
  throw new NotImplementedError('createIncubationSession');
}

export function createInputsGenSession(_opts: InputsGenSessionOptions): Promise<SessionHandle> {
  throw new NotImplementedError('createInputsGenSession');
}

export function createDesignSystemSession(_opts: DesignSystemSessionOptions): Promise<SessionHandle> {
  throw new NotImplementedError('createDesignSystemSession');
}

export function createInternalContextSession(
  _opts: InternalContextSessionOptions,
): Promise<SessionHandle> {
  throw new NotImplementedError('createInternalContextSession');
}
