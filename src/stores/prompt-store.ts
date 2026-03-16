import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { envNewlines } from '../lib/utils';
import { STORAGE_KEYS } from '../lib/storage-keys';
import { DEFAULTS, ENV_KEYS } from '../lib/prompts/defaults';

// Re-export data consumed by PromptEditor and other callers
export { PROMPT_META } from '../lib/prompts/defaults';
export type { PromptMeta } from '../lib/prompts/defaults';

// ── Prompt keys ─────────────────────────────────────────────────────

export type PromptKey =
  | 'compilerSystem'
  | 'compilerUser'
  | 'genSystemHtml'
  | 'genSystemHtmlAgentic'
  | 'variant'
  | 'designSystemExtract';

// ── Store ────────────────────────────────────────────────────────────

interface PromptStore {
  overrides: Partial<Record<PromptKey, string>>;
  setOverride: (key: PromptKey, value: string) => void;
  clearOverride: (key: PromptKey) => void;
  clearAll: () => void;
}

export const usePromptStore = create<PromptStore>()(
  persist(
    (set) => ({
      overrides: {},
      setOverride: (key, value) =>
        set((s) => ({ overrides: { ...s.overrides, [key]: value } })),
      clearOverride: (key) =>
        set((s) => {
          const { [key]: _, ...rest } = s.overrides;
          return { overrides: rest };
        }),
      clearAll: () => set({ overrides: {} }),
    }),
    { name: STORAGE_KEYS.PROMPTS }
  )
);

// ── Getters (store override → env var → default) ────────────────────

function getEnvValue(key: PromptKey): string | undefined {
  const envKey = ENV_KEYS[key];
  const val = (import.meta.env as Record<string, string | undefined>)[envKey];
  return val ? envNewlines(val) : undefined;
}

/** Get the effective prompt for a key: store override → env var → default */
export function getPrompt(key: PromptKey): string {
  const override = usePromptStore.getState().overrides[key];
  if (override !== undefined) return override;
  return getEnvValue(key) ?? DEFAULTS[key];
}

/** Get the built-in default for a key (ignoring overrides and env vars) */
export function getPromptDefault(key: PromptKey): string {
  return DEFAULTS[key];
}
