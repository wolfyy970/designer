/**
 * Provider-specific mapping of `ThinkingConfig` → request body fields.
 * Keep provider-specific quirks (OpenRouter's `reasoning` object vs.
 * OpenAI-compatible `reasoning_effort`) out of generic request builders.
 */
import type { ThinkingConfig, ThinkingLevel } from './thinking-defaults';

/** OpenRouter's `reasoning.effort` only accepts three values. */
export type ReasoningEffort = 'low' | 'medium' | 'high';

/** Collapse our 6-level enum to the provider's 3-level effort scale. */
export function levelToEffort(level: ThinkingLevel): ReasoningEffort | null {
  switch (level) {
    case 'off':
      return null;
    case 'minimal':
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
    case 'xhigh':
      return 'high';
  }
}

/**
 * OpenRouter request extras. Attaches `reasoning: { effort, max_tokens }`
 * per OpenRouter's spec. Empty object when thinking is off / unsupported.
 */
export function openRouterThinkingFields(
  thinking: ThinkingConfig | undefined,
): Record<string, unknown> {
  if (!thinking || thinking.level === 'off') return {};
  const effort = levelToEffort(thinking.level);
  if (!effort) return {};
  return {
    reasoning: {
      effort,
      max_tokens: thinking.budgetTokens,
    },
  };
}

/**
 * LM Studio / OpenAI-compatible request extras. Uses the simple
 * `reasoning_effort` string field. The local server silently ignores it on
 * non-reasoning models.
 */
export function lmStudioThinkingFields(
  thinking: ThinkingConfig | undefined,
): Record<string, unknown> {
  if (!thinking || thinking.level === 'off') return {};
  const effort = levelToEffort(thinking.level);
  if (!effort) return {};
  return { reasoning_effort: effort };
}
