import { describe, it, expect } from 'vitest';
import {
  buildEvaluatorTracesSection,
  buildRoundHistorySection,
  type EvaluationRoundHistoryEntry,
} from '../agentic-revision-user.ts';

describe('buildEvaluatorTracesSection', () => {
  it('truncates implementation shorter than design by default', () => {
    const long = 'x'.repeat(5000);
    const body = buildEvaluatorTracesSection({
      design: long,
      strategy: long,
      implementation: long,
    });
    expect(body).toContain('Design quality');
    expect(body).toContain('Implementation');
    const implIdx = body.indexOf('### Implementation');
    const implSlice = body.slice(implIdx);
    expect(implSlice.length).toBeLessThan(long.length + 400);
  });

  it('returns empty when no traces', () => {
    expect(buildEvaluatorTracesSection(undefined)).toBe('');
    expect(buildEvaluatorTracesSection({})).toBe('');
  });
});

describe('buildRoundHistorySection', () => {
  it('renders table and deltas between last two rounds', () => {
    const h: EvaluationRoundHistoryEntry[] = [
      {
        round: 1,
        rubricMeans: { design: 2.5, strategy: 3, implementation: 4, browser: 4 },
        overallScore: 3.1,
        hardFailCount: 1,
        normalizedScores: { design_a: 2, design_b: 3, strategy_x: 3 },
      },
      {
        round: 2,
        rubricMeans: { design: 3.5, strategy: 3, implementation: 4, browser: 4 },
        overallScore: 3.7,
        hardFailCount: 0,
        normalizedScores: { design_a: 4, design_b: 3, strategy_x: 3 },
      },
    ];
    const s = buildRoundHistorySection(h);
    expect(s).toContain('| 1 |');
    expect(s).toContain('1→2');
    expect(s).toContain('design_a');
  });

  it('returns empty for empty history', () => {
    expect(buildRoundHistorySection([])).toBe('');
  });
});
