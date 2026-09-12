/**
 * Returns true if a model ID matches known extended-reasoning model patterns.
 * Used by both server providers (listModels) and client hooks (useTaskModel).
 *
 * Pattern rationale:
 * - o1/o3/o4 — OpenAI reasoning series
 * - claude-3[-.]5, claude-3[-.]7, claude-4 — Anthropic extended thinking
 * - deepseek-r1, deepseek-reasoner — DeepSeek reasoning models
 * - minimax-m2.7 — MiniMax reasoning model
 * - qwq — Qwen reasoning model
 * - qwen3 — Qwen 3 series (all reasoning-capable)
 * - -thinking — generic suffix used by some providers
 *
 * This is a hand-maintained allowlist, so it goes stale whenever the default
 * model changes — which it did. Every DeepSeek V4 model (`deepseek-v4*`)
 * advertises `reasoning` and `reasoning_effort` and emits reasoning tokens, but
 * the previous entries only matched the `r1` / `reasoner` families, so V4.1
 * Flash was reported as non-reasoning and thinking levels were forced to `off`.
 *
 * **When changing the pinned default model, check it against this list.** A
 * model that reasons but is reported as non-reasoning is not an error the user
 * can see — it just silently loses a feature. `openRouterThinkingFields()`
 * passes `reasoning.effort`/`max_tokens`, which OpenRouter accepts for every
 * model above that advertises `reasoning_effort`.
 */
const REASONING_PATTERNS = [
  /\bo[1-9]\b/i,
  /claude-3[-.]5/i,
  /claude-3[-.]7/i,
  /claude-4/i,
  /deepseek-r1/i,
  /deepseek-reasoner/i,
  /deepseek-v4/i,
  /minimax-m2\.7/i,
  /\bqwq\b/i,
  /qwen3/i,
  /-thinking\b/i,
];

export function supportsReasoningModel(id: string): boolean {
  return REASONING_PATTERNS.some((re) => re.test(id));
}
