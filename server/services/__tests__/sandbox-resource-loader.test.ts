import { describe, it, expect } from 'vitest';
import { compactionReserveTokensForContextWindow } from '../sandbox-resource-loader.ts';

describe('compactionReserveTokensForContextWindow', () => {
  it('uses at least 24k reserve tokens', () => {
    expect(compactionReserveTokensForContextWindow(50_000)).toBe(24_000);
  });

  it('uses 28% of context window when that exceeds 24k', () => {
    expect(compactionReserveTokensForContextWindow(131_072)).toBe(
      Math.floor(131_072 * 0.28),
    );
  });
});
