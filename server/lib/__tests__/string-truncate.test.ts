import { describe, it, expect } from 'vitest';
import { truncateUtf16WithSuffix } from '../string-truncate.ts';

describe('truncateUtf16WithSuffix', () => {
  it('returns unchanged when under limit', () => {
    expect(truncateUtf16WithSuffix('hello', 10)).toBe('hello');
  });

  it('clips and appends default suffix', () => {
    const out = truncateUtf16WithSuffix('abcdefghij', 5);
    expect(out.startsWith('abcde')).toBe(true);
    expect(out).toContain('truncated');
  });

  it('respects custom suffix', () => {
    expect(truncateUtf16WithSuffix('abc', 2, '…')).toBe('ab…');
  });
});
