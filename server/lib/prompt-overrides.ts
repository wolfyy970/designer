/**
 * Sanitize client-sent promptOverrides: only known {@link PromptKey} entries,
 * non-empty strings. Used for per-request experimentation (not persisted server-side).
 */
import { getPromptBody } from '../db/prompts.ts';
import { PROMPT_KEYS, type PromptKey } from '../../src/lib/prompts/defaults.ts';

const KEY_SET = new Set<string>(PROMPT_KEYS);

export function sanitizePromptOverrides(
  raw: Record<string, string> | undefined,
): Partial<Record<PromptKey, string>> | undefined {
  if (!raw) return undefined;
  const out: Partial<Record<PromptKey, string>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KEY_SET.has(k) || typeof v !== 'string') continue;
    if (v.length === 0) continue;
    out[k as PromptKey] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Prefer per-request override strings; fall back to Langfuse / shared-defaults. */
export function createResolvePromptBody(
  overrides: Partial<Record<PromptKey, string>> | undefined,
): (key: PromptKey) => Promise<string> {
  if (!overrides) return getPromptBody;
  return async (key: PromptKey) => {
    const local = overrides[key];
    if (local != null && local.length > 0) return local;
    return getPromptBody(key);
  };
}
