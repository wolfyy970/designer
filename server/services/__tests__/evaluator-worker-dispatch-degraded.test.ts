import { describe, it, expect } from 'vitest';
import { buildDegradedReport } from '../evaluator-worker-dispatch.ts';

describe('buildDegradedReport', () => {
  it('returns evaluator_worker_error hard fail and zero score', () => {
    const r = buildDegradedReport('design', new Error('network down'));
    expect(r.rubric).toBe('design');
    expect(r.hardFails.some((h) => h.code === 'evaluator_worker_error')).toBe(true);
    expect(r.scores.evaluator_unavailable?.score).toBe(0);
    expect(r.findings[0]?.severity).toBe('high');
  });
});
