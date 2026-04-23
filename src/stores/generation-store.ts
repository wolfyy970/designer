import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { z } from 'zod';
import type { GenerationResult } from '../types/provider';
import type { EvaluationRoundSnapshot } from '../types/evaluation';
import { GENERATION_STATUS } from '../constants/generation';
import { storage } from '../storage';
import { STORAGE_KEYS } from '../lib/storage-keys';

/**
 * Fire-and-forget IDB cleanup — never rethrows (quota / write failures
 * must not crash the store update). Logs via `console.error` so the
 * failure surfaces in production consoles; grep-stable `[idb]` prefix
 * mirrors the `[write-gate]` / `[bridge]` / `[pi-emit]` convention.
 */
const idbCleanup = (p: Promise<void>) =>
  p.catch((err) => {
    console.error('[idb] cleanup failed:', err);
  });

const generationStatusSchema = z.enum([
  GENERATION_STATUS.PENDING,
  GENERATION_STATUS.GENERATING,
  GENERATION_STATUS.COMPLETE,
  GENERATION_STATUS.ERROR,
]);

const aggregatedHardFailSchema = z.object({
  code: z.string(),
  message: z.string(),
  source: z.enum(['design', 'strategy', 'implementation', 'browser']),
});

const aggregatedEvaluationReportSchema = z.object({
  overallScore: z.number(),
  normalizedScores: z.record(z.string(), z.number()),
  hardFails: z.array(aggregatedHardFailSchema),
  prioritizedFixes: z.array(z.string()),
  shouldRevise: z.boolean(),
  revisionBrief: z.string(),
  /** Stripped before persist (server-only diagnostic). */
  evaluatorTraces: z.record(z.string(), z.string()).optional(),
});

/** Persisted rounds omit `files` (stored in IndexedDB); worker slots stay loose for version tolerance. */
const evaluatorWorkerReportPersistedSchema = z
  .object({
    rubric: z.enum(['design', 'strategy', 'implementation', 'browser']),
  })
  .passthrough();

const evaluationRoundSnapshotPersistedSchema = z.object({
  round: z.number(),
  aggregate: aggregatedEvaluationReportSchema,
  design: evaluatorWorkerReportPersistedSchema.optional(),
  strategy: evaluatorWorkerReportPersistedSchema.optional(),
  implementation: evaluatorWorkerReportPersistedSchema.optional(),
  browser: evaluatorWorkerReportPersistedSchema.optional(),
});

const thinkingTurnSliceSchema = z.object({
  turnId: z.number(),
  text: z.string(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
});

const persistedMetadataSchema = z.object({
  model: z.string(),
  tokensUsed: z.number().optional(),
  durationMs: z.number().optional(),
  completedAt: z.string().optional(),
  truncated: z.boolean().optional(),
});

const persistedGenerationResultSchema = z.object({
  id: z.string(),
  strategyId: z.string(),
  providerId: z.string(),
  status: generationStatusSchema,
  runId: z.string(),
  runNumber: z.number(),
  metadata: persistedMetadataSchema.optional(),
  error: z.string().optional(),
  progressMessage: z.string().optional(),
  activityLog: z.array(z.string()).optional(),
  activityByTurn: z.record(z.string(), z.string()).optional(),
  thinkingTurns: z.array(thinkingTurnSliceSchema).optional(),
  evaluationSummary: aggregatedEvaluationReportSchema.optional(),
  evaluationRounds: z.array(evaluationRoundSnapshotPersistedSchema).optional(),
});

function persistedRowToGenerationResult(
  r: z.infer<typeof persistedGenerationResultSchema>,
): GenerationResult {
  const out: GenerationResult = {
    id: r.id,
    strategyId: r.strategyId,
    providerId: r.providerId,
    status: r.status,
    runId: r.runId,
    runNumber: r.runNumber,
    metadata: r.metadata ?? { model: '' },
  };
  if (r.error !== undefined) out.error = r.error;
  if (r.progressMessage !== undefined) out.progressMessage = r.progressMessage;
  if (r.activityLog !== undefined) out.activityLog = r.activityLog;
  if (r.activityByTurn !== undefined) out.activityByTurn = r.activityByTurn;
  if (r.thinkingTurns !== undefined) out.thinkingTurns = r.thinkingTurns;
  if (r.evaluationSummary !== undefined) out.evaluationSummary = r.evaluationSummary;
  if (r.evaluationRounds !== undefined) {
    out.evaluationRounds = r.evaluationRounds as EvaluationRoundSnapshot[];
  }
  return out;
}

/**
 * Validates persisted generation rows one-by-one. Invalid rows are dropped; valid rows and
 * references in `selectedVersions` / `userBestOverrides` are preserved so a single bad row
 * does not wipe the entire generation history.
 *
 * @internal Exported for tests — validates persisted slice after version migrations.
 */
export function pickValidatedGenerationPersistSlice(state: Record<string, unknown>): {
  results: GenerationResult[];
  selectedVersions: Record<string, string>;
  userBestOverrides: Record<string, string>;
} {
  const rawResults = Array.isArray(state.results) ? state.results : [];
  const results: GenerationResult[] = [];
  const validIds = new Set<string>();
  for (const row of rawResults) {
    const parsed = persistedGenerationResultSchema.safeParse(row);
    if (parsed.success) {
      const gr = persistedRowToGenerationResult(parsed.data);
      results.push(gr);
      validIds.add(gr.id);
    }
  }

  const selectedVersions: Record<string, string> = {};
  const svRaw = state.selectedVersions;
  if (svRaw && typeof svRaw === 'object' && !Array.isArray(svRaw)) {
    for (const [k, v] of Object.entries(svRaw)) {
      if (typeof v === 'string' && validIds.has(v)) {
        selectedVersions[k] = v;
      }
    }
  }

  const userBestOverrides: Record<string, string> = {};
  const uboRaw = state.userBestOverrides;
  if (uboRaw && typeof uboRaw === 'object' && !Array.isArray(uboRaw)) {
    for (const [k, v] of Object.entries(uboRaw)) {
      if (typeof v === 'string' && validIds.has(v)) {
        userBestOverrides[k] = v;
      }
    }
  }

  return { results, selectedVersions, userBestOverrides };
}

/**
 * Zustand persist migration for the generation store. Kept in one place so tests can run the
 * same ladder as production without duplicating logic.
 *
 * @internal Exported for migration integration tests.
 */
export function migrateGenerationPersistState(
  persisted: unknown,
  version: number,
): Record<string, unknown> {
  const state = persisted as Record<string, unknown>;
  if (version < 2) {
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
  if (version < 4) {
    (state as Record<string, unknown>).userBestOverrides =
      (state as Record<string, unknown>).userBestOverrides ?? {};
  }
  if (version < 5) {
    const results = (state.results as Record<string, unknown>[]) ?? [];
    state.results = results.map((r) => {
      if ('variantStrategyId' in r && !('strategyId' in r)) {
        const { variantStrategyId, ...rest } = r;
        return { ...rest, strategyId: variantStrategyId };
      }
      return r;
    });
  }

  const rawCount = Array.isArray(state.results) ? state.results.length : 0;
  const validated = pickValidatedGenerationPersistSlice(state);
  if (import.meta.env.DEV && rawCount > validated.results.length) {
    console.warn('[generation-store] migrate: dropped invalid result rows', {
      before: rawCount,
      after: validated.results.length,
    });
  }
  state.results = validated.results;
  state.selectedVersions = validated.selectedVersions;
  (state as Record<string, unknown>).userBestOverrides = validated.userBestOverrides;
  return state;
}

interface GenerationStore {
  results: GenerationResult[];
  isGenerating: boolean;
  /** Which version is currently displayed per hypothesis (strategyId → resultId) */
  selectedVersions: Record<string, string>;
  /** User override: prefer this complete result as “best” for a strategy lane. */
  userBestOverrides: Record<string, string>;

  addResult: (result: GenerationResult) => void;
  updateResult: (id: string, updates: Partial<GenerationResult>) => void;
  setGenerating: (isGenerating: boolean) => void;
  setSelectedVersion: (strategyId: string, resultId: string) => void;
  setUserBest: (strategyId: string, resultId: string | null) => void;
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
      userBestOverrides: {},

      addResult: (result) =>
        set((state) => ({ results: [...state.results, result] })),

      updateResult: (id, updates) =>
        set((state) => {
          const prev = state.results.find((r) => r.id === id);
          const nextResults = state.results.map((r) =>
            r.id === id ? { ...r, ...updates } : r,
          );
          if (!prev) {
            return { results: nextResults };
          }
          const merged = nextResults.find((r) => r.id === id)!;
          let selectedVersions = state.selectedVersions;
          if (
            prev.status === GENERATION_STATUS.GENERATING &&
            (updates.status === GENERATION_STATUS.COMPLETE ||
              updates.status === GENERATION_STATUS.ERROR) &&
            updates.status !== undefined
          ) {
            const vsId = merged.strategyId;
            const runId = merged.runId;
            selectedVersions = {
              ...state.selectedVersions,
              [vsId]: id,
              [`${vsId}:${runId}`]: id,
            };
          }
          return { results: nextResults, selectedVersions };
        }),

      setGenerating: (isGenerating) => set({ isGenerating }),

      setSelectedVersion: (strategyId, resultId) =>
        set((state) => ({
          selectedVersions: {
            ...state.selectedVersions,
            [strategyId]: resultId,
          },
        })),

      setUserBest: (strategyId, resultId) =>
        set((state) => {
          const userBestOverrides = { ...state.userBestOverrides };
          if (resultId == null) {
            delete userBestOverrides[strategyId];
          } else {
            userBestOverrides[strategyId] = resultId;
          }
          return { userBestOverrides };
        }),

      deleteResult: (resultId) => {
        idbCleanup(storage.deleteCode(resultId));
        idbCleanup(storage.deleteProvenance(resultId));
        idbCleanup(storage.deleteFiles(resultId));
        idbCleanup(storage.deleteRoundFilesForResult(resultId));

        set((state) => {
          const filtered = state.results.filter((r) => r.id !== resultId);
          const sv = { ...state.selectedVersions };
          for (const [vsId, rId] of Object.entries(sv)) {
            if (rId === resultId) delete sv[vsId];
          }
          const userBestOverrides = { ...state.userBestOverrides };
          for (const [vsId, rId] of Object.entries(userBestOverrides)) {
            if (rId === resultId) delete userBestOverrides[vsId];
          }
          return { results: filtered, selectedVersions: sv, userBestOverrides };
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
            idbCleanup(storage.deleteRoundFilesForResult(id));
          }

          const userBestOverrides = { ...state.userBestOverrides };
          for (const id of toDelete) {
            for (const [vsId, rId] of Object.entries(userBestOverrides)) {
              if (rId === id) delete userBestOverrides[vsId];
            }
          }

          return { results: filtered, selectedVersions: sv, userBestOverrides };
        });
      },

      reset: () => {
        set({ results: [], isGenerating: false, selectedVersions: {}, userBestOverrides: {} });
        idbCleanup(storage.clearAllCodes());
        idbCleanup(storage.clearAllFiles());
      },
    }),
    {
      name: STORAGE_KEYS.GENERATION,
      version: 5,
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
          delete persisted.liveSkills;
          delete persisted.liveActivatedSkills;
          delete persisted.agenticPhase;
          delete persisted.evaluationStatus;
          delete persisted.lastAgentFileAt;
          delete persisted.lastActivityAt;
          delete persisted.lastTraceAt;
          delete persisted.activeToolName;
          delete persisted.activeToolPath;
          delete persisted.streamingToolName;
          delete persisted.streamingToolPath;
          delete persisted.streamingToolChars;
          delete persisted.streamedModelChars;
          delete persisted.liveEvalWorkers;
          if (persisted.evaluationSummary) {
            const es = { ...persisted.evaluationSummary };
            delete es.evaluatorTraces;
            persisted.evaluationSummary = es;
          }
          if (persisted.evaluationRounds?.length) {
            persisted.evaluationRounds = persisted.evaluationRounds.map((er) => {
              const meta = { ...er };
              delete meta.files;
              if (meta.aggregate) {
                const agg = { ...meta.aggregate };
                delete agg.evaluatorTraces;
                meta.aggregate = agg;
              }
              for (const slot of ['design', 'strategy', 'implementation', 'browser'] as const) {
                const w = meta[slot];
                if (w && typeof w === 'object' && 'rawTrace' in w) {
                  const { rawTrace: _t, ...rest } = w as { rawTrace?: string };
                  void _t;
                  meta[slot] = rest as typeof w;
                }
              }
              return meta;
            });
          }
          return persisted;
        }),
        selectedVersions: state.selectedVersions,
        userBestOverrides: state.userBestOverrides,
      }),
      migrate: (persisted, version) =>
        migrateGenerationPersistState(persisted, version) as unknown as GenerationStore,
    },
  ),
);

// ── Derived helpers (not stored, computed from state) ──────────────────

/** Minimal state shape needed by derived helpers */
export interface GenerationState {
  results: GenerationResult[];
  selectedVersions: Record<string, string>;
  userBestOverrides?: Record<string, string>;
}

/**
 * Count of in-flight agentic runs reflected in the UI (each GENERATING row = one server slot).
 * Multi-model hypothesis runs create one row per lane; parallel lanes each consume a slot.
 */
export function countActiveGenerationSlots(state: GenerationState): number {
  return state.results.filter((r) => r.status === GENERATION_STATUS.GENERATING).length;
}

function getEvaluationRank(result: GenerationResult): number {
  if (result.status !== GENERATION_STATUS.COMPLETE) return Number.NEGATIVE_INFINITY;
  return result.evaluationSummary?.overallScore ?? Number.NEGATIVE_INFINITY;
}

export function getBestCompleteResult(
  results: GenerationResult[],
  options?: { strategyId?: string; userBestOverrides?: Record<string, string> },
): GenerationResult | undefined {
  const completed = results.filter((r) => r.status === GENERATION_STATUS.COMPLETE);
  if (completed.length === 0) return undefined;

  const vsId = options?.strategyId;
  const overrides = options?.userBestOverrides;
  if (vsId && overrides?.[vsId]) {
    const preferred = completed.find((r) => r.id === overrides[vsId]);
    if (preferred) return preferred;
  }

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
  strategyId: string,
): GenerationResult[] {
  return state.results
    .filter((r) => r.strategyId === strategyId)
    .sort((a, b) => b.runNumber - a.runNumber);
}

/** Get the active result for a hypothesis (selected, generating, or best complete) */
export function getActiveResult(
  state: GenerationState,
  strategyId: string,
): GenerationResult | undefined {
  const stack = getStack(state, strategyId);
  const generating = stack.find((r) => r.status === GENERATION_STATUS.GENERATING);
  if (generating) return generating;

  const selectedId = state.selectedVersions[strategyId];
  if (selectedId) {
    const selected = state.results.find((r) => r.id === selectedId);
    if (selected) return selected;
  }
  return (
    getBestCompleteResult(stack, {
      strategyId,
      userBestOverrides: state.userBestOverrides,
    }) ?? stack[0]
  );
}

/** Get all results for a hypothesis scoped to a specific run, newest first */
export function getScopedStack(
  state: GenerationState,
  strategyId: string,
  runId: string,
): GenerationResult[] {
  return state.results
    .filter((r) => r.strategyId === strategyId && r.runId === runId)
    .sort((a, b) => b.runNumber - a.runNumber);
}

/** Get the active result for a hypothesis scoped to a specific run */
export function getScopedActiveResult(
  state: GenerationState,
  strategyId: string,
  runId: string,
): GenerationResult | undefined {
  const stack = getScopedStack(state, strategyId, runId);
  const generating = stack.find((r) => r.status === GENERATION_STATUS.GENERATING);
  if (generating) return generating;

  const scopedKey = `${strategyId}:${runId}`;
  const selectedId = state.selectedVersions[scopedKey];
  if (selectedId) {
    const selected = state.results.find((r) => r.id === selectedId);
    if (selected) return selected;
  }
  return (
    getBestCompleteResult(stack, {
      strategyId,
      userBestOverrides: state.userBestOverrides,
    }) ?? stack[0]
  );
}

/** Next run number for a hypothesis */
export function nextRunNumber(
  state: Pick<GenerationState, 'results'>,
  strategyId: string,
): number {
  const existing = state.results.filter(
    (r) => r.strategyId === strategyId,
  );
  if (existing.length === 0) return 1;
  return Math.max(...existing.map((r) => r.runNumber)) + 1;
}
