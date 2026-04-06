import { describe, it, expect } from 'vitest';
import type { DomainIncubatorWiring } from '../../types/workspace-domain';

function countStructuralInputs(w: DomainIncubatorWiring): number {
  return w.inputNodeIds.length + w.previewNodeIds.length;
}

describe('countStructuralInputs', () => {
  it('sums input and preview ids', () => {
    expect(
      countStructuralInputs({
        inputNodeIds: ['a', 'b'],
        previewNodeIds: ['v'],
      }),
    ).toBe(3);
  });

  it('returns 0 for empty wiring', () => {
    expect(
      countStructuralInputs({
        inputNodeIds: [],
        previewNodeIds: [],
      }),
    ).toBe(0);
  });
});
