/**
 * Pure completion-budget math: how many tokens we can afford to ask for given the
 * context window, an estimated prompt size, and a per-purpose margin (formatting +
 * tool-def growth + reasoning + safety).
 *
 * **`DEFAULT_COMPLETION_BUDGET` below is NOT the host's table, and the host's
 * `config/completion-budget.json` does not reach this module.** The previous
 * comment here claimed the two were "aligned … at the time of extraction"; every
 * value differs, by 4×–64× (`absoluteCeiling` 32 768 here vs 2 097 152 there).
 *
 * What that means in practice: `host.ts` calls `buildModel()` without a
 * `budgetConfig`, so these values set `model.maxTokens`, and
 * `server/lib/pi-stream-budget.ts` then clamps every turn to it. The *per-turn*
 * figure still comes from the host config through
 * `completionBudgetFromPromptTokens`, so this is not unbounded — but the hard
 * ceiling is 32 768 regardless of context window, and raising
 * `config/completion-budget.json`'s `absoluteCeiling` has no effect.
 *
 * Changing either side alters real token budgets, so this is left as-is and
 * pinned by `completion-budget-parity.test.ts` instead. If the host table should
 * win, pass it in from `host.ts` and delete this constant.
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
