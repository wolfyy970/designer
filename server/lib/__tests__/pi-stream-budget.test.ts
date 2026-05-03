import { describe, it, expect } from 'vitest';
import type { Context } from '@auto-designer/pi';
import { piStreamCompletionMaxTokens } from '../pi-stream-budget.ts';

const model = { contextWindow: 100_000, maxTokens: 8192 };

function ctx(overrides: Partial<Context> = {}): Context {
  return {
    systemPrompt: 'sys',
    messages: [],
    ...overrides,
  } as Context;
}

describe('piStreamCompletionMaxTokens', () => {
  it('returns the explicit option verbatim when supplied', () => {
    expect(piStreamCompletionMaxTokens(model, ctx(), 1234)).toBe(1234);
  });

  it('respects the model.maxTokens ceiling for tiny contexts', () => {
    const out = piStreamCompletionMaxTokens(model, ctx());
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThanOrEqual(model.maxTokens);
  });

  it('shrinks the budget as prompt size grows', () => {
    const userMsg = (s: string) =>
      ({ role: 'user', content: s, timestamp: 0 }) as unknown as Context['messages'][number];
    const big = ctx({
      systemPrompt: 'a'.repeat(60_000),
      messages: [userMsg('b'.repeat(60_000)), userMsg('c'.repeat(60_000))],
    });
    const small = ctx({ systemPrompt: 'sys', messages: [userMsg('hi')] });
    const big1 = piStreamCompletionMaxTokens(model, big);
    const small1 = piStreamCompletionMaxTokens(model, small);
    expect(big1).toBeLessThanOrEqual(small1);
  });
});
