/**
 * Public API for the auto-designer Pi boundary.
 *
 * Phase 2 (this commit): VFS sandbox + Pi-native tool builders + designer extension
 * + SessionScopedResourceLoader + session host factories. The legacy path under
 * server/services/pi-* still serves every session; Phase 4 cuts over per session
 * type behind a PI_INTEGRATION env flag, Phase 5 deletes the legacy code.
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
// Resource loader (session-scoped skill filtering)

export {
  SessionScopedResourceLoader,
  SESSION_TAGS,
  defaultSkillTagLookup,
  parseTagsFromFrontmatter,
  clearSkillTagCache,
  type SessionType,
  type SkillTagLookup,
  type SessionScopedSkillFilterOptions,
} from './resource-loader.ts';

// ────────────────────────────────────────────────────────────────────────────
// Designer extension (todo_write, validate_js, validate_html, compaction hook)

export {
  createDesignerExtensionFactory,
  type DesignerExtensionOptions,
} from './extension/designer.ts';
export {
  createTodoWriteTool,
  createValidateJsTool,
  createValidateHtmlTool,
} from './extension/designer-tools.ts';

// ────────────────────────────────────────────────────────────────────────────
// Model + completion budget

export {
  buildModel,
  type BuildModelOptions,
  type ProviderConfig,
  type OpenRouterProviderConfig,
  type LMStudioProviderConfig,
  type ThinkingLevel,
} from './model.ts';
export {
  completionBudgetFromPromptTokens,
  maxCompletionBudgetForContextWindow,
  DEFAULT_COMPLETION_BUDGET,
  type CompletionPurpose,
  type CompletionBudgetConfig,
} from './internal/completion-budget.ts';

// ────────────────────────────────────────────────────────────────────────────
// Event bridge + retries

export { subscribeNarrowBridge, type SessionEvent } from './event-bridge.ts';
export {
  isAppRetryableUpstreamError,
  APP_RETRYABLE_UPSTREAM_PATTERN,
  sleepMs,
} from './internal/upstream-retry.ts';

// ────────────────────────────────────────────────────────────────────────────
// Session host factories

export {
  createSession,
  createDesignSession,
  createEvaluationSession,
  createIncubationSession,
  createInputsGenSession,
  createDesignSystemSession,
  createInternalContextSession,
  type SessionRunnerOptions,
  type SessionRunResult,
  type SessionHandle,
  type DesignSessionOptions,
  type EvaluationSessionOptions,
  type IncubationSessionOptions,
  type InputsGenSessionOptions,
  type DesignSystemSessionOptions,
  type InternalContextSessionOptions,
} from './host.ts';

// ────────────────────────────────────────────────────────────────────────────
// Shared types

export type { TodoItem, TodoStatus } from './types.ts';

// ────────────────────────────────────────────────────────────────────────────
// Bundled-content paths (for hosts that need to point Pi's loaders at them)

export {
  PACKAGE_ROOT,
  PACKAGE_SKILLS_DIR,
  PACKAGE_PROMPTS_DIR,
  PACKAGE_EXTENSIONS_DIR,
  PACKAGE_DESIGNER_SYSTEM_PROMPT_PATH,
  loadDesignerSystemPrompt,
  loadPackagePromptBody,
} from './paths.ts';

// ────────────────────────────────────────────────────────────────────────────
// Limits

export {
  SANDBOX_LIMITS,
  SANDBOX_READ_MAX_LINES,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
} from './internal/limits.ts';
