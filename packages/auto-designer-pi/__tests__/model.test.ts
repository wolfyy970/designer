import { describe, it, expect } from 'vitest';
import { buildModel } from '../src/model';
import {
  DEFAULT_COMPLETION_BUDGET,
  completionBudgetFromPromptTokens,
  maxCompletionBudgetForContextWindow,
} from '../src/internal/completion-budget';
import { isAppRetryableUpstreamError } from '../src/internal/upstream-retry';

describe('buildModel', () => {
  it('builds an OpenRouter model with the supplied baseUrl', () => {
    const m = buildModel({
      provider: { id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'k' },
      modelId: 'anthropic/claude-sonnet-4',
      contextWindow: 200_000,
      thinkingLevel: 'medium',
    });
    expect(m.provider).toBe('openrouter');
    expect(m.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(m.id).toBe('anthropic/claude-sonnet-4');
    expect(m.reasoning).toBe(true);
    expect(m.contextWindow).toBe(200_000);
  });

  it('builds an LM Studio model and appends /v1 to the baseUrl', () => {
    const m = buildModel({
      provider: { id: 'lmstudio', baseUrl: 'http://localhost:1234' },
      modelId: 'mistral-small',
    });
    expect(m.provider).toBe('lmstudio');
    expect(m.baseUrl).toBe('http://localhost:1234/v1');
    expect(m.reasoning).toBe(false);
  });

  it('clamps contextWindow to a minimum of 4096', () => {
    const m = buildModel({
      provider: { id: 'openrouter', baseUrl: 'x', apiKey: 'k' },
      modelId: 'm',
      contextWindow: 1024,
    });
    expect(m.contextWindow).toBe(4096);
  });
});

describe('completionBudgetFromPromptTokens', () => {
  it('returns budget = ceiling when context is large', () => {
    const out = completionBudgetFromPromptTokens(200_000, 1000, 'agent_turn');
    expect(out).toBe(DEFAULT_COMPLETION_BUDGET.absoluteCeiling);
  });

  it('returns undefined when window is exhausted', () => {
    const out = completionBudgetFromPromptTokens(8192, 50_000, 'agent_turn');
    expect(out).toBeUndefined();
  });

  it('honours productCap', () => {
    const out = completionBudgetFromPromptTokens(200_000, 1000, 'agent_turn', 4096);
    expect(out).toBe(4096);
  });
});

describe('maxCompletionBudgetForContextWindow', () => {
  it('caps at the absolute ceiling for large windows', () => {
    expect(maxCompletionBudgetForContextWindow(200_000)).toBe(
      DEFAULT_COMPLETION_BUDGET.absoluteCeiling,
    );
  });

  it('falls back to the 4096 floor for tiny windows', () => {
    // 8192 cw - 8192 default margin = 0 → minCompletion gate trips → fallback math
    // returns Math.max(4096, 8192 - 8192) = 4096.
    expect(maxCompletionBudgetForContextWindow(8192)).toBe(4096);
    expect(maxCompletionBudgetForContextWindow(4096)).toBeGreaterThanOrEqual(4096);
  });
});

describe('isAppRetryableUpstreamError', () => {
  it('flags upstream / 5xx / gateway / NaN / "provider error" messages', () => {
    expect(isAppRetryableUpstreamError('upstream timeout')).toBe(true);
    expect(isAppRetryableUpstreamError('502 bad gateway')).toBe(true);
    expect(isAppRetryableUpstreamError('NaN encountered')).toBe(true);
    expect(isAppRetryableUpstreamError('provider error: x')).toBe(true);
  });

  it('does not retry credit-exhaustion failures', () => {
    expect(isAppRetryableUpstreamError('Insufficient credits')).toBe(false);
    expect(isAppRetryableUpstreamError('402 payment required')).toBe(false);
  });

  it('returns false for empty / unrelated messages', () => {
    expect(isAppRetryableUpstreamError(undefined)).toBe(false);
    expect(isAppRetryableUpstreamError('   ')).toBe(false);
    expect(isAppRetryableUpstreamError('TypeError: x is not a function')).toBe(false);
  });
});
