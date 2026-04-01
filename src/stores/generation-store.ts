import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GenerationResult } from '../types/provider';
import { GENERATION_STATUS } from '../constants/generation';
import { storage } from '../storage';
import { STORAGE_KEYS } from '../lib/storage-keys';

/** Fire-and-forget cleanup — log in dev, silent in prod */
const idbCleanup = (p: Promise<void>) =>
  p.catch((err) => { if (import.meta.env.DEV) console.warn('[idb] cleanup failed:', err); });

interface GenerationStore {
  results: GenerationResult[];
  isGenerating: boolean;
  /** Which version is currently displayed per hypothesis (variantStrategyId → resultId) */
  selectedVersions: Record<string, string>;

  addResult: (result: GenerationResult) => void;
  updateResult: (id: string, updates: Partial<GenerationResult>) => void;
  setGenerating: (isGenerating: boolean) => void;
  setSelectedVersion: (variantStrategyId: string, resultId: string) => void;
  deleteResult: (resultId: string) => void;
  deleteRun: (runId: string) => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationStore>()(
  persist(
    (set) => ({
      results: [],
      isGenerating: false,
      selectedVersions: {},

      addResult: (result) =>
        set((state) => ({ results: [...state.results, result] })),

      updateResult: (id, updates) =>
        set((state) => ({
          results: state.results.map((r) =>
            r.id === id ? { ...r, ...updates } : r,
          ),
        })),

      setGenerating: (isGenerating) => set({ isGenerating }),

      setSelectedVersion: (variantStrategyId, resultId) =>
        set((state) => ({
          selectedVersions: {
            ...state.selectedVersions,
            [variantStrategyId]: resultId,
          },
        })),

      deleteResult: (resultId) => {
        idbCleanup(storage.deleteCode(resultId));
        idbCleanup(storage.deleteProvenance(resultId));
        idbCleanup(storage.deleteFiles(resultId));

        set((state) => {
          const filtered = state.results.filter((r) => r.id !== resultId);
          const sv = { ...state.selectedVersions };
          for (const [vsId, rId] of Object.entries(sv)) {
            if (rId === resultId) delete sv[vsId];
          }
          return { results: filtered, selectedVersions: sv };
        });
      },

      deleteRun: (runId) => {
        set((state) => {
          const toDelete = new Set(
            state.results.filter((r) => r.runId === runId).map((r) => r.id),
          );
          const filtered = state.results.filter((r) => !toDelete.has(r.id));
          const sv = { ...state.selectedVersions };
          for (const [vsId, rId] of Object.entries(sv)) {
            if (toDelete.has(rId)) delete sv[vsId];
          }

          for (const id of toDelete) {
            idbCleanup(storage.deleteCode(id));
            idbCleanup(storage.deleteProvenance(id));
            idbCleanup(storage.deleteFiles(id));
          }

          return { results: filtered, selectedVersions: sv };
        });
      },

      reset: () => {
        set({ results: [], isGenerating: false, selectedVersions: {} });
        idbCleanup(storage.clearAllCodes());
        idbCleanup(storage.clearAllFiles());
      },
    }),
    {
      name: STORAGE_KEYS.GENERATION,
      version: 3,
      partialize: (state) => ({
        // Strip `code`, `liveCode`, and `liveFiles` from persisted results — code lives in IndexedDB
        results: state.results.map((r) => {
          const persisted = { ...r };
          delete persisted.code;
          delete persisted.liveCode;
          delete persisted.liveFiles;
          delete persisted.liveFilesPlan;
          delete persisted.liveTodos;
          delete persisted.liveTrace;
          delete persisted.agenticPhase;
          delete persisted.evaluationStatus;
          delete persisted.lastAgentFileAt;
          delete persisted.lastActivityAt;
          delete persisted.lastTraceAt;
          delete persisted.activeToolName;
          delete persisted.activeToolPath;
          return persisted;
        }),
        selectedVersions: state.selectedVersions,
      }),
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          // v1 → v2: add runId and runNumber to existing results
          const results = (state.results as GenerationResult[]) ?? [];
          state.results = results.map((r) => ({
            ...r,
            runId: r.runId ?? 'legacy',
            runNumber: r.runNumber ?? 1,
          }));
          state.selectedVersions = state.selectedVersions ?? {};
        }
        if (version < 3) {
          const results = (state.results as GenerationResult[]) ?? [];
          state.results = results.map((r) => {
            const next = { ...r };
            delete next.evaluationSummary;
            delete next.evaluationRounds;
            delete next.evaluationStatus;
            return next;
          });
        }
        // Zustand merges migrated state with initial state — partial is expected
        return state as unknown as GenerationStore;
      },
    },
  ),
);

// ── Derived helpers (not stored, computed from state) ──────────────────

/** Minimal state shape needed by derived helpers */
export interface GenerationState {
  results: GenerationResult[];
  selectedVersions: Record<string, string>;
}

function getEvaluationRank(result: GenerationResult): number {
  if (result.status !== GENERATION_STATUS.COMPLETE) return Number.NEGATIVE_INFINITY;
  return result.evaluationSummary?.overallScore ?? Number.NEGATIVE_INFINITY;
}

export function getBestCompleteResult(
  results: GenerationResult[],
): GenerationResult | undefined {
  const completed = results.filter((r) => r.status === GENERATION_STATUS.COMPLETE);
  if (completed.length === 0) return undefined;

  const withEval = completed.filter((r) => r.evaluationSummary);
  if (withEval.length === 0) {
    return completed.sort((a, b) => b.runNumber - a.runNumber)[0];
  }

  return withEval.sort((a, b) => {
    const scoreDiff = getEvaluationRank(b) - getEvaluationRank(a);
    if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;
    return b.runNumber - a.runNumber;
  })[0];
}

/** Get all results for a hypothesis, newest first */
export function getStack(
  state: GenerationState,
  variantStrategyId: string,
): GenerationResult[] {
  return state.results
    .filter((r) => r.variantStrategyId === variantStrategyId)
    .sort((a, b) => b.runNumber - a.runNumber);
}

/** Get the active result for a hypothesis (selected, generating, or best complete) */
export function getActiveResult(
  state: GenerationState,
  variantStrategyId: string,
): GenerationResult | undefined {
  const selectedId = state.selectedVersions[variantStrategyId];
  if (selectedId) {
    const selected = state.results.find((r) => r.id === selectedId);
    if (selected) return selected;
  }
  // Fall back to latest generating or complete result
  const stack = getStack(state, variantStrategyId);
  return (
    stack.find((r) => r.status === GENERATION_STATUS.GENERATING) ??
    getBestCompleteResult(stack) ??
    stack[0]
  );
}

/** Get all results for a hypothesis scoped to a specific run, newest first */
export function getScopedStack(
  state: GenerationState,
  variantStrategyId: string,
  runId: string,
): GenerationResult[] {
  return state.results
    .filter((r) => r.variantStrategyId === variantStrategyId && r.runId === runId)
    .sort((a, b) => b.runNumber - a.runNumber);
}

/** Get the active result for a hypothesis scoped to a specific run */
export function getScopedActiveResult(
  state: GenerationState,
  variantStrategyId: string,
  runId: string,
): GenerationResult | undefined {
  // Scoped key: "vsId:runId" to avoid collision with live variants
  const scopedKey = `${variantStrategyId}:${runId}`;
  const selectedId = state.selectedVersions[scopedKey];
  if (selectedId) {
    const selected = state.results.find((r) => r.id === selectedId);
    if (selected) return selected;
  }
  const stack = getScopedStack(state, variantStrategyId, runId);
  return (
    stack.find((r) => r.status === GENERATION_STATUS.GENERATING) ??
    getBestCompleteResult(stack) ??
    stack[0]
  );
}

/** Next run number for a hypothesis */
export function nextRunNumber(
  state: Pick<GenerationState, 'results'>,
  variantStrategyId: string,
): number {
  const existing = state.results.filter(
    (r) => r.variantStrategyId === variantStrategyId,
  );
  if (existing.length === 0) return 1;
  return Math.max(...existing.map((r) => r.runNumber)) + 1;
}
