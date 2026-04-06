import { describe, it, expect, beforeEach } from 'vitest';
import { resolveEvaluatorSettings } from '../resolveEvaluatorSettings';
import { useWorkspaceDomainStore } from '../../stores/workspace-domain-store';
import { useEvaluatorDefaultsStore } from '../../stores/evaluator-defaults-store';
import { DEFAULT_RUBRIC_WEIGHTS } from '../../types/evaluation';

describe('resolveEvaluatorSettings', () => {
  beforeEach(() => {
    useWorkspaceDomainStore.getState().reset();
    useEvaluatorDefaultsStore.setState({
      maxRevisionRounds: 7,
      minOverallScore: 4.2,
      rubricWeights: { ...DEFAULT_RUBRIC_WEIGHTS, design: 0.5, strategy: 0.2, implementation: 0.2, browser: 0.1 },
      serverBaselineApplied: true,
    });
  });

  it('uses global defaults when the hypothesis is not in domain state', () => {
    const r = resolveEvaluatorSettings('missing-hypothesis');
    expect(r.maxRevisionRounds).toBe(7);
    expect(r.minOverallScore).toBe(4.2);
    expect(r.rubricWeights.design).toBeCloseTo(0.5, 5);
  });

  it('when revisionEnabled is false, forces maxRevisionRounds 0 and minOverallScore null', () => {
    useWorkspaceDomainStore.getState().linkHypothesisToIncubator('h1', 'inc1', 'vs1');
    useWorkspaceDomainStore.getState().setHypothesisGenerationSettings('h1', { revisionEnabled: false });
    const r = resolveEvaluatorSettings('h1');
    expect(r.maxRevisionRounds).toBe(0);
    expect(r.minOverallScore).toBeNull();
    expect(r.rubricWeights.design).toBeCloseTo(0.5, 5);
  });

  it('when revisionEnabled is true, applies per-hypothesis overrides and falls back for unset fields', () => {
    useWorkspaceDomainStore.getState().linkHypothesisToIncubator('h1', 'inc1', 'vs1');
    useWorkspaceDomainStore.getState().setHypothesisGenerationSettings('h1', {
      revisionEnabled: true,
      maxRevisionRounds: 3,
    });
    let r = resolveEvaluatorSettings('h1');
    expect(r.maxRevisionRounds).toBe(3);
    expect(r.minOverallScore).toBe(4.2);

    useWorkspaceDomainStore.getState().setHypothesisGenerationSettings('h1', {
      minOverallScore: null,
    });
    r = resolveEvaluatorSettings('h1');
    expect(r.minOverallScore).toBeNull();
  });
});
