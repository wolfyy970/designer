import type { EvaluatorSettings } from '../types/evaluator-settings';
import { useEvaluatorDefaultsStore } from '../stores/evaluator-defaults-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';

/**
 * Resolved evaluator settings for a hypothesis generation run when **Auto-improve** is on.
 * Per-hypothesis overrides (max rounds, target score) win over Settings → Evaluator defaults.
 * Rubric weights stay global (Settings only).
 *
 * When **Auto-improve** is off, the server skips evaluation entirely (`evaluationContext: null`);
 * rounds/score here are still forced to 0 / null for any code that reads the payload.
 */
export function resolveEvaluatorSettings(hypothesisNodeId: string): EvaluatorSettings {
  const global = useEvaluatorDefaultsStore.getState();
  const h = useWorkspaceDomainStore.getState().hypotheses[hypothesisNodeId];

  if (h?.revisionEnabled === false) {
    return {
      maxRevisionRounds: 0,
      minOverallScore: null,
      rubricWeights: { ...global.rubricWeights },
    };
  }

  return {
    maxRevisionRounds: h?.maxRevisionRounds ?? global.maxRevisionRounds,
    minOverallScore:
      h?.minOverallScore !== undefined ? h.minOverallScore : global.minOverallScore,
    rubricWeights: { ...global.rubricWeights },
  };
}
