import { describe, expect, it } from 'vitest';
import { estimateChatMessagesTokens, estimateTextTokens } from '../token-estimate';

describe('token-estimate', () => {
  it('estimateTextTokens scales with length', () => {
    const s = 'a'.repeat(3600);
    expect(estimateTextTokens(s)).toBeGreaterThan(900);
    expect(estimateTextTokens(s)).toBeLessThan(1_400);
  });

  it('sums chat messages', () => {
    const n = estimateChatMessagesTokens([
      { role: 'system', content: 'x'.repeat(1800) },
      { role: 'user', content: 'y'.repeat(1800) },
    ]);
    expect(n).toBeGreaterThan(800);
  });
});
