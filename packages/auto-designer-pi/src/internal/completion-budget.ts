/**
 * Pure completion-budget math: how many tokens we can afford to ask for given the
 * context window, an estimated prompt size, and a per-purpose margin (formatting +
 * tool-def growth + reasoning + safety).
 *
 * Defaults are aligned with the host's `config/completion-budget.json` at the time
 * of extraction; callers can override per-session via `completionBudgetConfig`.
 */

export type CompletionPurpose = 'incubate' | 'compaction' | 'agent_turn' | 'default';

export interface CompletionBudgetConfig {
  minCompletion: number;
  absoluteCeiling: number;
  margins: Record<CompletionPurpose, number>;
}

export const DEFAULT_COMPLETION_BUDGET: CompletionBudgetConfig = {
  minCompletion: 1024,
  absoluteCeiling: 32_768,
  margins: {
    incubate: 8_192,
    compaction: 8_192,
    agent_turn: 16_384,
    default: 8_192,
  },
};

/**
 * Returns the completion-token budget after subtracting the prompt + margin from the
 * context window, capped by the absolute ceiling and an optional product cap. Returns
 * `undefined` when the window is exhausted — callers may omit `max_tokens` in that case.
 */
export function completionBudgetFromPromptTokens(
  contextWindow: number,
  estimatedPromptTokens: number,
  purpose: CompletionPurpose,
  productCap?: number,
  config: CompletionBudgetConfig = DEFAULT_COMPLETION_BUDGET,
): number | undefined {
  const cw = Math.max(4096, contextWindow);
  const margin = config.margins[purpose];
  const prompt = Math.max(0, estimatedPromptTokens);
  const raw = cw - prompt - margin;
  if (raw < config.minCompletion) return undefined;
  let b = Math.min(raw, config.absoluteCeiling);
  if (productCap != null) b = Math.min(b, productCap);
  return Math.max(config.minCompletion, b);
}

/** Session ceiling for Pi `Model.maxTokens` before per-turn prompt estimation. */
export function maxCompletionBudgetForContextWindow(
  contextWindow: number,
  productCap?: number,
  config: CompletionBudgetConfig = DEFAULT_COMPLETION_BUDGET,
): number {
  const SESSION_CEILING_FALLBACK_MARGIN = 8192;
  const capped = completionBudgetFromPromptTokens(contextWindow, 0, 'default', productCap, config);
  if (capped != null) return capped;
  return Math.max(4096, Math.max(4096, contextWindow) - SESSION_CEILING_FALLBACK_MARGIN);
}
