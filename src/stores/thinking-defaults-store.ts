/**
 * Per-task thinking (reasoning) overrides. Missing fields on a task fall back
 * to `THINKING_CONFIG_DEFAULTS`; the resolver applies the capability gate and
 * budget clamps at call-time — this store just persists user intent.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../lib/storage-keys';
import {
  THINKING_TASKS,
  type ThinkingLevel,
  type ThinkingOverride,
  type ThinkingTask,
} from '../lib/thinking-defaults';

export type ThinkingOverridesByTask = Record<ThinkingTask, ThinkingOverride>;

export interface ThinkingDefaultsStore {
  overrides: ThinkingOverridesByTask;
  /** Merge a level override (undefined clears). */
  setLevel: (task: ThinkingTask, level: ThinkingLevel | undefined) => void;
  /** Merge a budget override (undefined clears). */
  setBudgetTokens: (task: ThinkingTask, budgetTokens: number | undefined) => void;
  /** Reset a single task to its default (clears both level and budget overrides). */
  resetTask: (task: ThinkingTask) => void;
  /** Reset every task. */
  resetAll: () => void;
}

const EMPTY_OVERRIDES: ThinkingOverridesByTask = Object.fromEntries(
  THINKING_TASKS.map((t) => [t, {}]),
) as ThinkingOverridesByTask;

function updateTask(
  state: ThinkingOverridesByTask,
  task: ThinkingTask,
  patch: ThinkingOverride,
): ThinkingOverridesByTask {
  const current = state[task] ?? {};
  const next: ThinkingOverride = { ...current, ...patch };
  // Clean keys explicitly set to undefined so we don't persist them.
  if (patch.level === undefined && 'level' in patch) delete next.level;
  if (patch.budgetTokens === undefined && 'budgetTokens' in patch) delete next.budgetTokens;
  return { ...state, [task]: next };
}

export const useThinkingDefaultsStore = create<ThinkingDefaultsStore>()(
  persist(
    (set) => ({
      overrides: EMPTY_OVERRIDES,

      setLevel: (task, level) =>
        set((s) => ({ overrides: updateTask(s.overrides, task, { level }) })),

      setBudgetTokens: (task, budgetTokens) =>
        set((s) => ({ overrides: updateTask(s.overrides, task, { budgetTokens }) })),

      resetTask: (task) =>
        set((s) => ({ overrides: { ...s.overrides, [task]: {} } })),

      resetAll: () => set({ overrides: EMPTY_OVERRIDES }),
    }),
    {
      name: STORAGE_KEYS.THINKING_DEFAULTS,
      version: 1,
      partialize: (s) => ({ overrides: s.overrides }),
      migrate: (persisted) => {
        const p = persisted as Partial<ThinkingDefaultsStore>;
        // Ensure every task has an entry (forward-compat when we add tasks).
        const existing = p.overrides ?? ({} as Partial<ThinkingOverridesByTask>);
        const merged = { ...EMPTY_OVERRIDES } as ThinkingOverridesByTask;
        for (const t of THINKING_TASKS) {
          merged[t] = existing[t] ?? {};
        }
        return { ...p, overrides: merged } as ThinkingDefaultsStore;
      },
    },
  ),
);
