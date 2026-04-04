import type { EvaluatorSettings } from '../types/evaluator-settings';
import { useEvaluatorDefaultsStore } from '../stores/evaluator-defaults-store';

/**
 * Resolved evaluator settings for a hypothesis generation run.
 * v1: always returns global defaults from Settings → Evaluator.
 * v2: may read per-hypothesis overrides from workspace domain, then fall back to defaults.
 */
export function resolveEvaluatorSettings(hypothesisNodeId: string): EvaluatorSettings {
  void hypothesisNodeId; // reserved for per-hypothesis overrides (v2)
  const s = useEvaluatorDefaultsStore.getState();
  return {
    maxRevisionRounds: s.maxRevisionRounds,
    minOverallScore: s.minOverallScore,
  };
}
