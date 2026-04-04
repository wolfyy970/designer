import { LEGACY_PROMPT_KEY_ALIASES, PROMPT_META, type PromptKey } from '../stores/prompt-store';

const KEY_SET = new Set<PromptKey>(PROMPT_META.map((m) => m.key));

export function parsePromptKey(raw: string): PromptKey | null {
  if (KEY_SET.has(raw as PromptKey)) return raw as PromptKey;
  const mapped = LEGACY_PROMPT_KEY_ALIASES[raw as keyof typeof LEGACY_PROMPT_KEY_ALIASES];
  if (mapped && KEY_SET.has(mapped)) return mapped;
  return null;
}
