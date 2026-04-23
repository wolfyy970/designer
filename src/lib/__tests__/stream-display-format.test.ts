import { describe, it, expect } from 'vitest';
import { formatElapsedCompact, formatTokEstimate } from '../stream-display-format';

describe('formatElapsedCompact', () => {
  it('shows seconds only under one minute', () => {
    expect(formatElapsedCompact(0)).toBe('0s');
    expect(formatElapsedCompact(27)).toBe('27s');
    expect(formatElapsedCompact(59)).toBe('59s');
  });

  it('shows "Nm Ns" at exactly one minute and above', () => {
    expect(formatElapsedCompact(60)).toBe('1m');
    expect(formatElapsedCompact(87)).toBe('1m 27s');
    expect(formatElapsedCompact(120)).toBe('2m');
    expect(formatElapsedCompact(125)).toBe('2m 5s');
  });

  it('omits seconds when they are zero', () => {
    expect(formatElapsedCompact(180)).toBe('3m');
    expect(formatElapsedCompact(600)).toBe('10m');
  });
});

describe('formatTokEstimate', () => {
  it('returns empty string for zero / missing chars', () => {
    expect(formatTokEstimate(undefined)).toBe('');
    expect(formatTokEstimate(0)).toBe('');
  });

  it('returns integer count under 1k', () => {
    // 1800 / 3.6 = 500
    expect(formatTokEstimate(1800)).toBe('500');
  });

  it('returns Nk for round thousands', () => {
    // 36000 / 3.6 = 10000
    expect(formatTokEstimate(36_000)).toBe('10k');
  });

  it('returns N.Nk for mid-thousands', () => {
    // 4200 / 3.6 ≈ 1167 → 1.2k
    expect(formatTokEstimate(4_200)).toBe('1.2k');
  });
});
