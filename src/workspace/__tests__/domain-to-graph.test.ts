import { describe, it, expect } from 'vitest';
import { countStructuralInputs } from '../domain-to-graph';

describe('countStructuralInputs', () => {
  it('sums section, variant, and critique ids', () => {
    expect(
      countStructuralInputs({
        sectionNodeIds: ['a', 'b'],
        variantNodeIds: ['v'],
        critiqueNodeIds: [],
      }),
    ).toBe(3);
  });

  it('returns 0 for empty wiring', () => {
    expect(
      countStructuralInputs({
        sectionNodeIds: [],
        variantNodeIds: [],
        critiqueNodeIds: [],
      }),
    ).toBe(0);
  });
});
