import { describe, expect, it } from 'vitest';
import {
  incubationFirstHypothesisEmpty,
  incubationLooksLikeTemplateEcho,
} from '../incubation-template-echo.ts';

describe('incubationLooksLikeTemplateEcho', () => {
  it('returns false for normal incubation output', () => {
    expect(
      incubationLooksLikeTemplateEcho({
        dimensions: [{ name: 'Density', range: 'low ↔ high' }],
        hypotheses: [
          {
            name: 'Lean first screen',
            hypothesis: 'Users will find the CTA faster with less above-the-fold clutter.',
            rationale: 'The brief prioritizes conversion on first visit.',
          },
        ],
      }),
    ).toBe(false);
  });

  it('detects legacy string — placeholder echo on hypothesis fields', () => {
    expect(
      incubationLooksLikeTemplateEcho({
        dimensions: [{ name: 'Density', range: 'low ↔ high' }],
        hypotheses: [
          {
            name: 'string — short strategy label',
            hypothesis: 'string — the core design bet',
            rationale: 'Grounded in research.',
          },
        ],
      }),
    ).toBe(true);
  });

  it('detects hyphen variant string - placeholder', () => {
    expect(
      incubationLooksLikeTemplateEcho({
        dimensions: [{ name: 'string - dimension name', range: 'x' }],
        hypotheses: [],
      }),
    ).toBe(true);
  });
});

describe('incubationFirstHypothesisEmpty', () => {
  it('returns true when no hypotheses', () => {
    expect(incubationFirstHypothesisEmpty({ hypotheses: [] })).toBe(true);
  });

  it('returns true when hypothesis is empty even if name is set (Zod default name)', () => {
    expect(
      incubationFirstHypothesisEmpty({
        hypotheses: [{ name: 'Unnamed Hypothesis', hypothesis: '' }],
      }),
    ).toBe(true);
  });

  it('returns true when hypothesis is whitespace only', () => {
    expect(
      incubationFirstHypothesisEmpty({
        hypotheses: [{ name: 'Label', hypothesis: '   \n  ' }],
      }),
    ).toBe(true);
  });

  it('returns false when hypothesis has text', () => {
    expect(
      incubationFirstHypothesisEmpty({
        hypotheses: [{ name: '', hypothesis: 'Real bet here.' }],
      }),
    ).toBe(false);
  });
});
