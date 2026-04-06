import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PROMPT_KEYS, type PromptKey } from '../lib/prompts/defaults';
import { STORAGE_KEYS } from '../lib/storage-keys';

interface PromptOverridesState {
  /** Local-only draft bodies keyed by prompt id */
  overrides: Partial<Record<PromptKey, string>>;
  setOverride: (key: PromptKey, body: string) => void;
  clearOverride: (key: PromptKey) => void;
  clearAll: () => void;
}

/** Non-empty trimmed strings only, suitable for API `promptOverrides`. */
export function getActivePromptOverrides(
  overrides: Partial<Record<PromptKey, string>>,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const key of PROMPT_KEYS) {
    const v = overrides[key];
    if (v == null) continue;
    const t = v.trim();
    if (t.length === 0) continue;
    out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Spread into API request bodies: `{ promptOverrides }` when set, else `{}`. */
export function spreadPromptOverrides(
  promptOverrides: Record<string, string> | undefined,
): { promptOverrides: Record<string, string> } | Record<string, never> {
  return promptOverrides ? { promptOverrides } : {};
}

export const usePromptOverridesStore = create<PromptOverridesState>()(
  persist(
    (set) => ({
      overrides: {},
      setOverride: (key, body) =>
        set((s) => {
          const next = { ...s.overrides };
          if (body.trim().length === 0) delete next[key];
          else next[key] = body;
          return { overrides: next };
        }),
      clearOverride: (key) =>
        set((s) => {
          const next = { ...s.overrides };
          delete next[key];
          return { overrides: next };
        }),
      clearAll: () => set({ overrides: {} }),
    }),
    {
      name: STORAGE_KEYS.PROMPTS,
      partialize: (s) => ({ overrides: s.overrides }),
    },
  ),
);
