import { describe, expect, it } from 'vitest';
import type { SpecSectionId } from '../../src/types/spec.ts';
import { DEFAULT_HYPOTHESIS_COUNT, NO_BEST_SENTINEL, SECTION_KEYS } from '../constants.ts';

describe('meta-harness constants alignment', () => {
  it('SECTION_KEYS matches the five active DesignSpec canvas section ids (excludes legacy design-system)', () => {
    expect(SECTION_KEYS).toHaveLength(5);
    const satisfies: SpecSectionId[] = [...SECTION_KEYS];
    expect(satisfies).toEqual([
      'design-brief',
      'existing-design',
      'research-context',
      'objectives-metrics',
      'design-constraints',
    ]);
  });

  it('DEFAULT_HYPOTHESIS_COUNT is positive', () => {
    expect(DEFAULT_HYPOTHESIS_COUNT).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_HYPOTHESIS_COUNT)).toBe(true);
  });

  it('NO_BEST_SENTINEL is negative (no collision with valid candidate ids)', () => {
    expect(NO_BEST_SENTINEL).toBe(-1);
  });
});
