import { PROMPT_DEFAULTS } from '../../../src/lib/prompts/shared-defaults.ts';

export type PromptKey =
  | 'compilerSystem'
  | 'compilerUser'
  | 'genSystemHtml'
  | 'genSystemHtmlAgentic'
  | 'variant'
  | 'designSystemExtract'
  | 'evalDesignSystem'
  | 'evalStrategySystem'
  | 'evalImplementationSystem';

export const DEFAULTS: Record<PromptKey, string> = PROMPT_DEFAULTS as Record<PromptKey, string>;

/** Canonical ordered list of prompt keys (single source of truth with `PromptKey` + `DEFAULTS`). */
export const PROMPT_KEYS = Object.keys(DEFAULTS) as PromptKey[];

export function resolvePrompt(
  key: PromptKey,
  overrides?: Partial<Record<PromptKey, string>>
): string {
  return overrides?.[key] ?? DEFAULTS[key];
}
