import { describe, it, expect } from 'vitest';
import { countStructuralInputs } from '../domain-to-graph';

describe('countStructuralInputs', () => {
  it('sums section and variant ids', () => {
    expect(
      countStructuralInputs({
        sectionNodeIds: ['a', 'b'],
        variantNodeIds: ['v'],
      }),
    ).toBe(3);
  });

  it('returns 0 for empty wiring', () => {
    expect(
      countStructuralInputs({
        sectionNodeIds: [],
        variantNodeIds: [],
      }),
    ).toBe(0);
  });
});
