import { describe, it, expect } from 'vitest';
import { badgeColor } from '../badge-colors';

describe('badgeColor', () => {
  it('uses brand accent for every run number', () => {
    for (const n of [1, 2, 7, 100]) {
      const color = badgeColor(n);
      expect(color.bg).toBe('bg-accent-subtle');
      expect(color.text).toBe('text-accent');
    }
  });
});
