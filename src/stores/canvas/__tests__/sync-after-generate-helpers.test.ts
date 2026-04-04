import { describe, expect, it } from 'vitest';
import { firstResultIdByVariantStrategy } from '../sync-after-generate-helpers';

describe('firstResultIdByVariantStrategy', () => {
  it('keeps first id per strategy in iteration order', () => {
    const m = firstResultIdByVariantStrategy([
      { id: 'a', strategyId: 'vs1' },
      { id: 'b', strategyId: 'vs1' },
      { id: 'c', strategyId: 'vs2' },
    ]);
    expect(m.get('vs1')).toBe('a');
    expect(m.get('vs2')).toBe('c');
    expect(m.size).toBe(2);
  });

  it('returns empty map for empty input', () => {
    expect(firstResultIdByVariantStrategy([]).size).toBe(0);
  });
});
