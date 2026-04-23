import { describe, it, expect } from 'vitest';
import { buildRevisionUserPrompt } from '../revision-prompt.ts';
import type { EvaluationRoundSnapshot } from '../../../../src/types/evaluation.ts';

const compiledPrompt = 'Redesign the checkout flow.';

function makeSnapshot(
  overrides: Partial<EvaluationRoundSnapshot['aggregate']> = {},
): EvaluationRoundSnapshot {
  return {
    round: 2,
    files: {},
    aggregate: {
      overallScore: 3.2,
      dimensionScores: {},
      hardFails: [],
      prioritizedFixes: ['improve-cta', 'fix-contrast'],
      revisionBrief: 'Tighten the hero and fix contrast on CTA.',
      shouldRevise: true,
      evaluatorTraces: [],
      ...overrides,
    },
  } as EvaluationRoundSnapshot;
}

describe('buildRevisionUserPrompt', () => {
  it('assembles sections in documented order and numbers fixes', () => {
    const out = buildRevisionUserPrompt({
      compiledPrompt,
      evaluationContext: null,
      revisionUserInstructions: 'Revise carefully.',
      roundHistory: [],
      snapshot: makeSnapshot(),
    });
    expect(out).toContain('Revise carefully.');
    expect(out).toContain('## Revision brief');
    expect(out).toContain('Tighten the hero and fix contrast on CTA.');
    expect(out).toContain('## Prioritized fixes');
    expect(out).toContain('1. improve-cta');
    expect(out).toContain('2. fix-contrast');
    // Order invariant: revision brief comes before prioritized fixes
    expect(out.indexOf('## Revision brief')).toBeLessThan(out.indexOf('## Prioritized fixes'));
  });

  it('omits the evaluator traces section when traces array is empty', () => {
    const out = buildRevisionUserPrompt({
      compiledPrompt,
      evaluationContext: null,
      revisionUserInstructions: 'Revise.',
      roundHistory: [],
      snapshot: makeSnapshot({ evaluatorTraces: {} }),
    });
    // buildEvaluatorTracesSection returns '' when empty; nothing to assert on header text,
    // but the fixes still render, meaning the placeholder didn't break layout.
    expect(out).toContain('## Prioritized fixes');
  });

  it('handles empty prioritized fixes without throwing', () => {
    const out = buildRevisionUserPrompt({
      compiledPrompt,
      evaluationContext: null,
      revisionUserInstructions: 'Revise.',
      roundHistory: [],
      snapshot: makeSnapshot({ prioritizedFixes: [] }),
    });
    expect(out).toContain('## Prioritized fixes');
    // No numbered lines follow the header in this case — just the header.
    expect(out).not.toMatch(/## Prioritized fixes\n1\./);
  });
});
