import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CompiledPrompt, IncubationPlan, HypothesisStrategy } from '../types/incubator';
import { DEFAULT_INCUBATOR_PROVIDER } from '../lib/constants';
import { STORAGE_KEYS } from '../lib/storage-keys';
import { generateId, now } from '../lib/utils';

const LEGACY_INCUBATOR_STORAGE_KEY = 'auto-designer-compiler';

/** One-time copy from pre-rename persist key so users keep incubation plans. */
function migrateIncubatorPersistStorageKey(): void {
  if (typeof globalThis === 'undefined') return;
  const ls = (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
  if (!ls) return;
  try {
    if (ls.getItem(STORAGE_KEYS.INCUBATOR)) return;
    const legacy = ls.getItem(LEGACY_INCUBATOR_STORAGE_KEY);
    if (legacy) {
      ls.setItem(STORAGE_KEYS.INCUBATOR, legacy);
      ls.removeItem(LEGACY_INCUBATOR_STORAGE_KEY);
    }
  } catch {
    /* non-browser or private mode */
  }
}

migrateIncubatorPersistStorageKey();

// ── Selector helpers (for callers that need a single plan) ──────────

/** Find a hypothesis strategy by ID across all incubation plans */
export function findStrategy(
  incubationPlans: Record<string, IncubationPlan>,
  strategyId: string,
): HypothesisStrategy | undefined {
  for (const plan of Object.values(incubationPlans)) {
    const found = plan.hypotheses.find((h) => h.id === strategyId);
    if (found) return found;
  }
  return undefined;
}

/** Get all strategy IDs across all incubation plans */
export function allStrategyIds(incubationPlans: Record<string, IncubationPlan>): Set<string> {
  const ids = new Set<string>();
  for (const plan of Object.values(incubationPlans)) {
    for (const h of plan.hypotheses) ids.add(h.id);
  }
  return ids;
}

// ── Store interface ────────────────────────────────────────────────

interface IncubatorStore {
  /**
   * Incubation plans keyed by incubator id (1:1 with incubator canvas node id).
   * Domain / incubate flows treat this as `incubatorId`, not graph layout.
   */
  incubationPlans: Record<string, IncubationPlan>;
  compiledPrompts: CompiledPrompt[];
  isCompiling: boolean;
  error: string | null;
  /** Default provider/model for non-canvas views */
  selectedProvider: string;
  selectedModel: string;

  setPlanForNode: (incubatorId: string, plan: IncubationPlan) => void;
  removePlanForNode: (incubatorId: string) => void;
  setCompiledPrompts: (prompts: CompiledPrompt[]) => void;
  setCompiling: (isCompiling: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedProvider: (provider: string) => void;
  setSelectedModel: (model: string) => void;

  appendStrategiesToNode: (incubatorId: string, newPlan: IncubationPlan) => void;
  updateStrategy: (strategyId: string, updates: Partial<HypothesisStrategy>) => void;
  removeStrategy: (strategyId: string) => void;
  addStrategyToNode: (incubatorId: string) => void;
  approveMapForNode: (incubatorId: string) => void;

  reset: () => void;
}

/** Find a strategy in any incubation plan and apply a transform to the hypotheses array. */
function mutateStrategy(
  incubationPlans: Record<string, IncubationPlan>,
  strategyId: string,
  transform: (hypotheses: HypothesisStrategy[]) => HypothesisStrategy[],
): Record<string, IncubationPlan> {
  const updated = { ...incubationPlans };
  for (const [nodeId, plan] of Object.entries(updated)) {
    if (plan.hypotheses.some((h) => h.id === strategyId)) {
      updated[nodeId] = { ...plan, hypotheses: transform(plan.hypotheses) };
      break;
    }
  }
  return updated;
}

/**
 * Zustand persist migration for the incubator store. Exported so tests exercise the same
 * ladder as production (no duplicated migration logic).
 */
export function migrateIncubatorPersistState(
  persistedState: unknown,
  version: number,
): Record<string, unknown> {
  const state = persistedState as Record<string, unknown>;

  if (version < 1) {
    const incubationPlans: Record<string, IncubationPlan> = {};
    if (state.dimensionMap) {
      incubationPlans['compiler-node'] = state.dimensionMap as IncubationPlan;
    }
    Object.assign(state, { incubationPlans });
  }

  if (version < 2) {
    const maps = (state.dimensionMaps ?? state.incubationPlans) as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (maps) {
      for (const map of Object.values(maps)) {
        const items = (map.variants ?? map.hypotheses) as Record<string, unknown>[] | undefined;
        if (!items) continue;
        for (const v of items) {
          if ('primaryEmphasis' in v && !('hypothesis' in v)) {
            v.hypothesis = v.primaryEmphasis;
            delete v.primaryEmphasis;
          }
          if (!('measurements' in v)) v.measurements = '';
          delete v.howItDiffers;
          delete v.coupledDecisions;
        }
      }
    }
  }

  if (version < 3) {
    const oldMaps = state.dimensionMaps as Record<string, Record<string, unknown>> | undefined;
    if (oldMaps && !state.incubationPlans) {
      const incubationPlans: Record<string, unknown> = {};
      for (const [k, map] of Object.entries(oldMaps)) {
        const { variants, ...rest } = map;
        incubationPlans[k] = { ...rest, hypotheses: variants ?? [] };
      }
      state.incubationPlans = incubationPlans;
      delete state.dimensionMaps;
    } else if (state.incubationPlans) {
      const plans = state.incubationPlans as Record<string, Record<string, unknown>>;
      for (const plan of Object.values(plans)) {
        if (plan.variants && !plan.hypotheses) {
          plan.hypotheses = plan.variants;
          delete plan.variants;
        }
      }
    }
  }

  return state;
}

// ── Store implementation ────────────────────────────────────────────

export const useIncubatorStore = create<IncubatorStore>()(
  persist(
    (set) => ({
      incubationPlans: {},
      compiledPrompts: [],
      isCompiling: false,
      error: null,
      selectedProvider: DEFAULT_INCUBATOR_PROVIDER,
      selectedModel: '',

      setPlanForNode: (nodeId, plan) =>
        set((state) => ({
          incubationPlans: { ...state.incubationPlans, [nodeId]: plan },
          error: null,
        })),

      appendStrategiesToNode: (nodeId, newPlan) =>
        set((state) => {
          const existing = state.incubationPlans[nodeId];
          if (!existing) {
            return { incubationPlans: { ...state.incubationPlans, [nodeId]: newPlan }, error: null };
          }
          return {
            incubationPlans: {
              ...state.incubationPlans,
              [nodeId]: {
                ...existing,
                dimensions: newPlan.dimensions,
                hypotheses: [...existing.hypotheses, ...newPlan.hypotheses],
                generatedAt: newPlan.generatedAt,
                incubatorModel: newPlan.incubatorModel,
              },
            },
            error: null,
          };
        }),

      removePlanForNode: (nodeId) =>
        set((state) => {
          const rest = { ...state.incubationPlans };
          delete rest[nodeId];
          return { incubationPlans: rest };
        }),

      setCompiledPrompts: (prompts) => set({ compiledPrompts: prompts }),
      setCompiling: (isCompiling) => set({ isCompiling }),
      setError: (error) => set({ error }),
      setSelectedProvider: (provider) => set({ selectedProvider: provider }),
      setSelectedModel: (model) => set({ selectedModel: model }),

      updateStrategy: (strategyId, updates) =>
        set((state) => ({
          incubationPlans: mutateStrategy(state.incubationPlans, strategyId, (hs) =>
            hs.map((h) => (h.id === strategyId ? { ...h, ...updates } : h)),
          ),
        })),

      removeStrategy: (strategyId) =>
        set((state) => ({
          incubationPlans: mutateStrategy(state.incubationPlans, strategyId, (hs) =>
            hs.filter((h) => h.id !== strategyId),
          ),
        })),

      addStrategyToNode: (nodeId) =>
        set((state) => {
          const plan = state.incubationPlans[nodeId];
          if (!plan) return state;
          const newStrategy: HypothesisStrategy = {
            id: generateId(),
            name: 'New Hypothesis',
            hypothesis: '',
            rationale: '',
            measurements: '',
            dimensionValues: {},
          };
          return {
            incubationPlans: {
              ...state.incubationPlans,
              [nodeId]: {
                ...plan,
                hypotheses: [...plan.hypotheses, newStrategy],
              },
            },
          };
        }),

      approveMapForNode: (nodeId) =>
        set((state) => {
          const plan = state.incubationPlans[nodeId];
          if (!plan) return state;
          return {
            incubationPlans: {
              ...state.incubationPlans,
              [nodeId]: { ...plan, approvedAt: now() },
            },
          };
        }),

      reset: () =>
        set({
          incubationPlans: {},
          compiledPrompts: [],
          isCompiling: false,
          error: null,
        }),
    }),
    {
      name: STORAGE_KEYS.INCUBATOR,
      version: 3,
      migrate: (persistedState, version) =>
        migrateIncubatorPersistState(persistedState, version) as unknown as IncubatorStore,
      partialize: (state) => ({
        incubationPlans: state.incubationPlans,
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
      }),
    },
  ),
);
