import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CompiledPrompt, DimensionMap, VariantStrategy } from '../types/compiler';
import { DEFAULT_COMPILER_PROVIDER } from '../lib/constants';
import { STORAGE_KEYS } from '../lib/storage-keys';
import { generateId, now } from '../lib/utils';

// ── Selector helpers (for callers that need a single map) ──────────

/** Find a variant strategy by ID across all dimension maps */
export function findVariantStrategy(
  dimensionMaps: Record<string, DimensionMap>,
  variantId: string
): VariantStrategy | undefined {
  for (const map of Object.values(dimensionMaps)) {
    const found = map.variants.find((v) => v.id === variantId);
    if (found) return found;
  }
  return undefined;
}

/** Get all variant strategy IDs across all dimension maps */
export function allVariantStrategyIds(
  dimensionMaps: Record<string, DimensionMap>
): Set<string> {
  const ids = new Set<string>();
  for (const map of Object.values(dimensionMaps)) {
    for (const v of map.variants) ids.add(v.id);
  }
  return ids;
}

// ── Store interface ────────────────────────────────────────────────

interface CompilerStore {
  /**
   * Dimension maps keyed by incubator id (1:1 with compiler canvas node id).
   * Domain / compile flows treat this as `incubatorId`, not graph layout.
   */
  dimensionMaps: Record<string, DimensionMap>;
  compiledPrompts: CompiledPrompt[];
  isCompiling: boolean;
  error: string | null;
  /** Default provider/model for non-canvas views */
  selectedProvider: string;
  selectedModel: string;

  setDimensionMapForNode: (incubatorId: string, map: DimensionMap) => void;
  removeDimensionMapForNode: (incubatorId: string) => void;
  setCompiledPrompts: (prompts: CompiledPrompt[]) => void;
  setCompiling: (isCompiling: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedProvider: (provider: string) => void;
  setSelectedModel: (model: string) => void;

  appendVariantsToNode: (incubatorId: string, newMap: DimensionMap) => void;
  updateVariant: (variantId: string, updates: Partial<VariantStrategy>) => void;
  removeVariant: (variantId: string) => void;
  addVariantToNode: (incubatorId: string) => void;
  approveMapForNode: (incubatorId: string) => void;

  reset: () => void;
}

// CompilerStore interface used internally only

/** Find a variant in any dimension map and apply a transform to the variants array. */
function mutateVariant(
  dimensionMaps: Record<string, DimensionMap>,
  variantId: string,
  transform: (variants: VariantStrategy[]) => VariantStrategy[],
): Record<string, DimensionMap> {
  const updated = { ...dimensionMaps };
  for (const [nodeId, map] of Object.entries(updated)) {
    if (map.variants.some((v) => v.id === variantId)) {
      updated[nodeId] = { ...map, variants: transform(map.variants) };
      break;
    }
  }
  return updated;
}

// ── Store implementation ────────────────────────────────────────────

export const useCompilerStore = create<CompilerStore>()(
  persist(
    (set) => ({
      dimensionMaps: {},
      compiledPrompts: [],
      isCompiling: false,
      error: null,
      selectedProvider: DEFAULT_COMPILER_PROVIDER,
      selectedModel: '',

      setDimensionMapForNode: (nodeId, map) =>
        set((state) => ({
          dimensionMaps: { ...state.dimensionMaps, [nodeId]: map },
          error: null,
        })),

      appendVariantsToNode: (nodeId, newMap) =>
        set((state) => {
          const existing = state.dimensionMaps[nodeId];
          if (!existing) {
            // First run — store the whole map
            return { dimensionMaps: { ...state.dimensionMaps, [nodeId]: newMap }, error: null };
          }
          // Subsequent runs — update dimensions, append new variants
          return {
            dimensionMaps: {
              ...state.dimensionMaps,
              [nodeId]: {
                ...existing,
                dimensions: newMap.dimensions,
                variants: [...existing.variants, ...newMap.variants],
                generatedAt: newMap.generatedAt,
                compilerModel: newMap.compilerModel,
              },
            },
            error: null,
          };
        }),

      removeDimensionMapForNode: (nodeId) =>
        set((state) => {
          const rest = { ...state.dimensionMaps };
          delete rest[nodeId];
          return { dimensionMaps: rest };
        }),

      setCompiledPrompts: (prompts) => set({ compiledPrompts: prompts }),
      setCompiling: (isCompiling) => set({ isCompiling }),
      setError: (error) => set({ error }),
      setSelectedProvider: (provider) => set({ selectedProvider: provider }),
      setSelectedModel: (model) => set({ selectedModel: model }),

      updateVariant: (variantId, updates) =>
        set((state) => ({
          dimensionMaps: mutateVariant(state.dimensionMaps, variantId, (vs) =>
            vs.map((v) => (v.id === variantId ? { ...v, ...updates } : v)),
          ),
        })),

      removeVariant: (variantId) =>
        set((state) => ({
          dimensionMaps: mutateVariant(state.dimensionMaps, variantId, (vs) =>
            vs.filter((v) => v.id !== variantId),
          ),
        })),

      addVariantToNode: (nodeId) =>
        set((state) => {
          const map = state.dimensionMaps[nodeId];
          if (!map) return state;
          const newVariant: VariantStrategy = {
            id: generateId(),
            name: 'New Hypothesis',
            hypothesis: '',
            rationale: '',
            measurements: '',
            dimensionValues: {},
          };
          return {
            dimensionMaps: {
              ...state.dimensionMaps,
              [nodeId]: {
                ...map,
                variants: [...map.variants, newVariant],
              },
            },
          };
        }),

      approveMapForNode: (nodeId) =>
        set((state) => {
          const map = state.dimensionMaps[nodeId];
          if (!map) return state;
          return {
            dimensionMaps: {
              ...state.dimensionMaps,
              [nodeId]: { ...map, approvedAt: now() },
            },
          };
        }),

      reset: () =>
        set({
          dimensionMaps: {},
          compiledPrompts: [],
          isCompiling: false,
          error: null,
        }),
    }),
    {
      name: STORAGE_KEYS.COMPILER,
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;

        if (version < 1) {
          // v0→v1: Migrate from single dimensionMap to dimensionMaps record
          const dimensionMaps: Record<string, DimensionMap> = {};
          if (state.dimensionMap) {
            dimensionMaps['compiler-node'] = state.dimensionMap as DimensionMap;
          }
          Object.assign(state, { dimensionMaps });
        }

        if (version < 2) {
          // v1→v2: Rename primaryEmphasis→hypothesis, add measurements, drop howItDiffers/coupledDecisions
          const maps = state.dimensionMaps as Record<string, Record<string, unknown>> | undefined;
          if (maps) {
            for (const map of Object.values(maps)) {
              const variants = map.variants as Record<string, unknown>[] | undefined;
              if (!variants) continue;
              for (const v of variants) {
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

        return state;
      },
      partialize: (state) => ({
        dimensionMaps: state.dimensionMaps,
        // compiledPrompts excluded — transient, regenerated each compile/generate
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
      }),
    }
  )
);
