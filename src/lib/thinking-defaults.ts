/**
 * Thinking (extended reasoning) configuration — shared by client + server.
 *
 * This module is the single source of truth for:
 *  - the `ThinkingLevel` enum Pi's SDK accepts,
 *  - per-task defaults (level + token budget),
 *  - the budget clamp + level→baseline budget ladder used by the Settings UI,
 *  - the `resolveThinkingConfig(task, modelId, override?)` capability-gated resolver
 *    that every LLM call site uses to compose a final `ThinkingConfig`.
 *
 * No call site should read the defaults table directly. Always go through
 * `resolveThinkingConfig` so the capability gate and clamps apply consistently.
 */
import { z } from 'zod';
import { supportsReasoningModel } from './model-capabilities';

/** Pi SDK's native enum for reasoning strength. Mirrors `server/services/pi-model.ts`. */
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export const THINKING_LEVELS = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const satisfies readonly ThinkingLevel[];

/**
 * Which task the LLM call is serving — drives defaults.
 * `hypothesis` auto-generate shares the `incubate` pathway on the server, so
 * they share a single task slot here. `design` covers the agentic build
 * (hypothesis design + any future single-hypothesis design agent).
 */
export type ThinkingTask =
  | 'design'
  | 'incubate'
  | 'inputs'
  | 'design-system'
  | 'evaluator';

export const THINKING_TASKS = [
  'design',
  'incubate',
  'inputs',
  'design-system',
  'evaluator',
] as const satisfies readonly ThinkingTask[];

/** Full config sent to the LLM provider. */
export type ThinkingConfig = {
  level: ThinkingLevel;
  /** Max tokens of reasoning the provider is allowed to emit. `0` when `level === 'off'`. */
  budgetTokens: number;
};

/** Partial override a client / user may supply; fields missing fall back to the task default. */
export type ThinkingOverride = Partial<ThinkingConfig>;

/** Budget input clamps. `MIN` matches the Anthropic extended-thinking API floor. */
export const THINKING_BUDGET_MIN_TOKENS = 1024;
export const THINKING_BUDGET_MAX_TOKENS = 32768;

/**
 * Baseline budget per level — the ladder the UI shows as a placeholder when
 * a user picks a level but leaves the budget field blank. `off` is always 0.
 */
export const THINKING_BUDGET_BY_LEVEL = {
  off: 0,
  minimal: THINKING_BUDGET_MIN_TOKENS,
  low: 2048,
  medium: 8192,
  high: 16384,
  xhigh: THINKING_BUDGET_MAX_TOKENS,
} as const satisfies Record<ThinkingLevel, number>;

/**
 * Per-task defaults. Heuristic:
 *  - creative / long tasks (design, hypothesis, incubate) → deeper reasoning
 *  - structured extraction (inputs, design-system, evaluator) → just enough to
 *    reduce format mistakes without wasting tokens.
 * Tune values here — call sites never hardcode.
 */
export const THINKING_CONFIG_DEFAULTS = {
  design: { level: 'high', budgetTokens: 16384 },
  incubate: { level: 'medium', budgetTokens: 8192 },
  inputs: { level: 'low', budgetTokens: 2048 },
  'design-system': { level: 'low', budgetTokens: 2048 },
  evaluator: { level: 'low', budgetTokens: 2048 },
} as const satisfies Record<ThinkingTask, ThinkingConfig>;

/** Always-off config. Returned when the model doesn't support reasoning. */
export const THINKING_OFF: ThinkingConfig = { level: 'off', budgetTokens: 0 };

// ── Zod schemas (shared by API route validators) ────────────────────────────

export const ThinkingLevelSchema = z.enum(THINKING_LEVELS);

export const ThinkingConfigSchema = z.object({
  level: ThinkingLevelSchema,
  budgetTokens: z.number().int().min(0),
});

/** Partial override accepted from clients; missing fields fall back to task defaults. */
export const ThinkingOverrideSchema = z
  .object({
    level: ThinkingLevelSchema.optional(),
    budgetTokens: z.number().int().min(0).optional(),
  })
  .strict();

function clampBudget(n: number): number {
  if (Number.isNaN(n)) return THINKING_BUDGET_MIN_TOKENS;
  if (n >= THINKING_BUDGET_MAX_TOKENS) return THINKING_BUDGET_MAX_TOKENS;
  if (n <= THINKING_BUDGET_MIN_TOKENS) return THINKING_BUDGET_MIN_TOKENS;
  return Math.round(n);
}

/**
 * Single read-point for capability + defaults + override. Call this from every
 * LLM dispatch site; never hand-build a `ThinkingConfig`.
 */
export function resolveThinkingConfig(
  task: ThinkingTask,
  modelId: string | undefined | null,
  override?: ThinkingOverride,
): ThinkingConfig {
  if (!modelId || !supportsReasoningModel(modelId)) return THINKING_OFF;

  const defaults = THINKING_CONFIG_DEFAULTS[task];
  const level: ThinkingLevel = override?.level ?? defaults.level;

  if (level === 'off') return THINKING_OFF;

  const rawBudget = override?.budgetTokens ?? defaults.budgetTokens;
  return { level, budgetTokens: clampBudget(rawBudget) };
}
