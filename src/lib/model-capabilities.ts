/**
 * Returns true if a model ID matches known extended-reasoning model patterns.
 * Used by both server providers (listModels) and client hooks (useConnectedModel).
 *
 * Pattern rationale:
 * - o1/o3/o4 — OpenAI reasoning series
 * - claude-3[-.]5, claude-3[-.]7, claude-4 — Anthropic extended thinking
 * - deepseek-r1, deepseek-reasoner — DeepSeek reasoning models
 * - qwq — Qwen reasoning model
 * - qwen3 — Qwen 3 series (all reasoning-capable)
 * - -thinking — generic suffix used by some providers
 */
const REASONING_PATTERNS = [
  /\bo[1-9]\b/i,
  /claude-3[-.]5/i,
  /claude-3[-.]7/i,
  /claude-4/i,
  /deepseek-r1/i,
  /deepseek-reasoner/i,
  /\bqwq\b/i,
  /qwen3/i,
  /-thinking\b/i,
];

export function supportsReasoningModel(id: string): boolean {
  return REASONING_PATTERNS.some((re) => re.test(id));
}
