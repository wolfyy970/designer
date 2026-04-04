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

export type EvaluatorDefaultsStore = EvaluatorSettings & {
  /**
   * After first successful sync from GET /api/config, user edits are not overwritten by later config fetches.
   */
  serverBaselineApplied: boolean;
  setMaxRevisionRounds: (n: number) => void;
  /** Pass null to disable quality early-exit */
  setMinOverallScore: (score: number | null) => void;
  /** Apply server env defaults once (before user customizes or after fresh storage). */
  seedFromServerConfig: (config: Pick<AppConfigResponse, 'agenticMaxRevisionRounds' | 'agenticMinOverallScore'>) => void;
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

export const useEvaluatorDefaultsStore = create<EvaluatorDefaultsStore>()(
  persist(
    (set, get) => ({
      maxRevisionRounds: DEFAULT_EVALUATOR_SETTINGS.maxRevisionRounds,
      minOverallScore: DEFAULT_EVALUATOR_SETTINGS.minOverallScore,
      serverBaselineApplied: false,

      setMaxRevisionRounds: (n) =>
        set({
          maxRevisionRounds: clampRounds(n),
        }),

      setMinOverallScore: (score) =>
        set({
          minOverallScore: score == null ? null : clampScore(score),
        }),

      seedFromServerConfig: (config) => {
        if (get().serverBaselineApplied) return;
        set({
          maxRevisionRounds: clampRounds(config.agenticMaxRevisionRounds),
          minOverallScore:
            config.agenticMinOverallScore != null && Number.isFinite(config.agenticMinOverallScore)
              ? clampScore(config.agenticMinOverallScore)
              : null,
          serverBaselineApplied: true,
        });
      },
    }),
    {
      name: STORAGE_KEYS.EVALUATOR_DEFAULTS,
      version: 1,
      partialize: (s) => ({
        maxRevisionRounds: s.maxRevisionRounds,
        minOverallScore: s.minOverallScore,
        serverBaselineApplied: s.serverBaselineApplied,
      }),
    },
  ),
);
