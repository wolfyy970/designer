import { describe, it, expect } from 'vitest';
import type { DomainIncubatorWiring } from '../../types/workspace-domain';

function countStructuralInputs(w: DomainIncubatorWiring): number {
  return w.sectionNodeIds.length + w.variantNodeIds.length;
}

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
