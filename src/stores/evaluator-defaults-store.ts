import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../lib/storage-keys';
import type { AppConfigResponse } from '../api/response-schemas';
import {
  DEFAULT_EVALUATOR_SETTINGS,
  EVALUATOR_MAX_REVISION_ROUNDS_MAX,
  EVALUATOR_MAX_REVISION_ROUNDS_MIN,
  EVALUATOR_MAX_SCORE,
  EVALUATOR_MIN_SCORE,
  type EvaluatorSettings,
} from '../types/evaluator-settings';
import {
  DEFAULT_RUBRIC_WEIGHTS,
  EVALUATOR_RUBRIC_IDS,
  type EvaluatorRubricId,
} from '../types/evaluation.ts';

export type EvaluatorDefaultsStore = EvaluatorSettings & {
  /**
   * After first successful sync from GET /api/config, user edits are not overwritten by later config fetches.
   */
  serverBaselineApplied: boolean;
  setMaxRevisionRounds: (n: number) => void;
  /** Pass null to disable quality early-exit */
  setMinOverallScore: (score: number | null) => void;
  /** Merge partial weights, renormalize so the four sum to 1. */
  setRubricWeights: (patch: Partial<Record<EvaluatorRubricId, number>>) => void;
  /** Apply server env defaults once (before user customizes or after fresh storage). */
  seedFromServerConfig: (
    config: Pick<
      AppConfigResponse,
      'agenticMaxRevisionRounds' | 'agenticMinOverallScore' | 'defaultRubricWeights'
    >,
  ) => void;
};

function clampRounds(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_EVALUATOR_SETTINGS.maxRevisionRounds;
  return Math.min(
    EVALUATOR_MAX_REVISION_ROUNDS_MAX,
    Math.max(EVALUATOR_MAX_REVISION_ROUNDS_MIN, Math.trunc(n)),
  );
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return EVALUATOR_MIN_SCORE;
  return Math.min(EVALUATOR_MAX_SCORE, Math.max(EVALUATOR_MIN_SCORE, n));
}

function normalizeRubricWeights(
  current: Record<EvaluatorRubricId, number>,
  patch: Partial<Record<EvaluatorRubricId, number>>,
): Record<EvaluatorRubricId, number> {
  const out: Record<EvaluatorRubricId, number> = { ...current };
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const v = patch[rid];
    if (v != null && Number.isFinite(v) && v >= 0) {
      out[rid] = v;
    }
  }
  const sum = EVALUATOR_RUBRIC_IDS.reduce((a, rid) => a + out[rid], 0);
  if (sum <= 0) return { ...DEFAULT_RUBRIC_WEIGHTS };
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    out[rid] = out[rid] / sum;
  }
  return out;
}

export const useEvaluatorDefaultsStore = create<EvaluatorDefaultsStore>()(
  persist(
    (set, get) => ({
      maxRevisionRounds: DEFAULT_EVALUATOR_SETTINGS.maxRevisionRounds,
      minOverallScore: DEFAULT_EVALUATOR_SETTINGS.minOverallScore,
      rubricWeights: { ...DEFAULT_EVALUATOR_SETTINGS.rubricWeights },
      serverBaselineApplied: false,

      setMaxRevisionRounds: (n) =>
        set({
          maxRevisionRounds: clampRounds(n),
        }),

      setMinOverallScore: (score) =>
        set({
          minOverallScore: score == null ? null : clampScore(score),
        }),

      setRubricWeights: (patch) =>
        set((s) => ({
          rubricWeights: normalizeRubricWeights(s.rubricWeights, patch),
        })),

      seedFromServerConfig: (config) => {
        if (get().serverBaselineApplied) return;
        set({
          maxRevisionRounds: clampRounds(config.agenticMaxRevisionRounds),
          minOverallScore:
            config.agenticMinOverallScore != null && Number.isFinite(config.agenticMinOverallScore)
              ? clampScore(config.agenticMinOverallScore)
              : null,
          rubricWeights: normalizeRubricWeights(
            DEFAULT_RUBRIC_WEIGHTS,
            config.defaultRubricWeights,
          ),
          serverBaselineApplied: true,
        });
      },
    }),
    {
      name: STORAGE_KEYS.EVALUATOR_DEFAULTS,
      version: 2,
      migrate: (persisted, fromVersion) => {
        const p = persisted as Partial<EvaluatorDefaultsStore>;
        if (fromVersion < 2) {
          return {
            ...p,
            rubricWeights: { ...DEFAULT_RUBRIC_WEIGHTS },
          } as EvaluatorDefaultsStore;
        }
        return p as EvaluatorDefaultsStore;
      },
      partialize: (s) => ({
        maxRevisionRounds: s.maxRevisionRounds,
        minOverallScore: s.minOverallScore,
        rubricWeights: s.rubricWeights,
        serverBaselineApplied: s.serverBaselineApplied,
      }),
    },
  ),
);
