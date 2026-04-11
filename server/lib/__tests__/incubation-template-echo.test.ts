import { describe, expect, it } from 'vitest';
import { incubationLooksLikeTemplateEcho } from '../incubation-template-echo.ts';

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
