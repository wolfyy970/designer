import { describe, it, expect } from 'vitest';
import {
  aggregateEvaluationReports,
  enforceRevisionGate,
  isEvalSatisfied,
} from '../evaluator-aggregation.ts';

const healthy = (rubric: 'design' | 'strategy' | 'implementation' | 'browser') => ({
  rubric,
  scores: { a: { score: 4, notes: 'ok' } },
  findings: [],
  hardFails: [],
});

describe('aggregateEvaluationReports shouldRevise contract', () => {
  it('always sets shouldRevise to false; enforceRevisionGate derives revision from rules', () => {
    const agg = aggregateEvaluationReports({
      design: healthy('design'),
      strategy: healthy('strategy'),
      implementation: healthy('implementation'),
      browser: healthy('browser'),
    });
    expect(agg.shouldRevise).toBe(false);
    const gated = enforceRevisionGate(agg);
    expect(typeof gated.shouldRevise).toBe('boolean');
    expect(isEvalSatisfied(gated)).toBe(!gated.shouldRevise);
  });
});
