import { describe, it, expect, beforeEach } from 'vitest';
import { useEvaluatorDefaultsStore } from '../evaluator-defaults-store';

describe('evaluator-defaults-store seedFromServerConfig', () => {
  beforeEach(() => {
    useEvaluatorDefaultsStore.setState({
      maxRevisionRounds: 1,
      minOverallScore: null,
      rubricWeights: { design: 0.9, strategy: 0.1, implementation: 0, browser: 0 },
      serverBaselineApplied: false,
    });
  });

  it('applies defaultRubricWeights and revision caps on first sync', () => {
    useEvaluatorDefaultsStore.getState().seedFromServerConfig({
      agenticMaxRevisionRounds: 4,
      agenticMinOverallScore: 3,
      defaultRubricWeights: {
        design: 0.25,
        strategy: 0.25,
        implementation: 0.25,
        browser: 0.25,
      },
    });
    const s = useEvaluatorDefaultsStore.getState();
    expect(s.maxRevisionRounds).toBe(4);
    expect(s.minOverallScore).toBe(3);
    expect(s.rubricWeights.design).toBeCloseTo(0.25, 5);
    expect(s.serverBaselineApplied).toBe(true);
  });

  it('does not run after serverBaselineApplied is true', () => {
    useEvaluatorDefaultsStore.setState({
      maxRevisionRounds: 2,
      rubricWeights: { design: 0.4, strategy: 0.3, implementation: 0.2, browser: 0.1 },
      serverBaselineApplied: true,
    });
    useEvaluatorDefaultsStore.getState().seedFromServerConfig({
      agenticMaxRevisionRounds: 9,
      agenticMinOverallScore: null,
      defaultRubricWeights: { design: 1, strategy: 0, implementation: 0, browser: 0 },
    });
    const s = useEvaluatorDefaultsStore.getState();
    expect(s.maxRevisionRounds).toBe(2);
    expect(s.rubricWeights.design).toBe(0.4);
  });
});
