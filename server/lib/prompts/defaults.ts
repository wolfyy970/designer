import { PROMPT_DEFAULTS } from '../../../src/lib/prompts/shared-defaults.ts';

export type PromptKey =
  | 'compilerSystem'
  | 'compilerUser'
  | 'genSystemHtml'
  | 'genSystemHtmlAgentic'
  | 'variant'
  | 'designSystemExtract';

export const DEFAULTS: Record<PromptKey, string> = PROMPT_DEFAULTS as Record<PromptKey, string>;

export function resolvePrompt(
  key: PromptKey,
  overrides?: Partial<Record<PromptKey, string>>
): string {
  return overrides?.[key] ?? DEFAULTS[key];
}
