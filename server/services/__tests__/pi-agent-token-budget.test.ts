import { describe, expect, it, afterEach, vi } from 'vitest';
import { buildModel, maxCompletionBudgetForContextWindow } from '../pi-agent-compaction.ts';

describe('maxCompletionBudgetForContextWindow', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reserves default margin below total context (no prompt)', () => {
    vi.stubEnv('MAX_OUTPUT_TOKENS', '');
    expect(maxCompletionBudgetForContextWindow(100_000)).toBe(100_000 - 4096);
  });

  it('applies MAX_OUTPUT_TOKENS when set', () => {
    vi.stubEnv('MAX_OUTPUT_TOKENS', '4096');
    expect(maxCompletionBudgetForContextWindow(200_000)).toBe(4096);
  });
});

describe('buildModel token metadata', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('derives a large maxTokens from default OpenRouter fallback context', () => {
    vi.stubEnv('MAX_OUTPUT_TOKENS', '');
    const m = buildModel('openrouter', 'anthropic/claude-3.5-sonnet');
    expect(m.contextWindow).toBe(131_072);
    expect(m.maxTokens).toBe(131_072 - 4096);
  });

  it('uses explicit registry context window', () => {
    vi.stubEnv('MAX_OUTPUT_TOKENS', '');
    const m = buildModel('openrouter', 'x', undefined, 50_000);
    expect(m.contextWindow).toBe(50_000);
    expect(m.maxTokens).toBe(50_000 - 4096);
  });
});
