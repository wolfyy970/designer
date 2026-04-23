import { describe, it, expect } from 'vitest';
import {
  THINKING_CONFIG_DEFAULTS,
  THINKING_BUDGET_BY_LEVEL,
  THINKING_BUDGET_MIN_TOKENS,
  THINKING_BUDGET_MAX_TOKENS,
  THINKING_LEVELS,
  THINKING_TASKS,
  THINKING_OFF,
  resolveThinkingConfig,
} from '../thinking-defaults';

// Matches `/\bo[1-9]\b/i` in src/lib/model-capabilities.ts.
const REASONING_MODEL = 'openai/o1';
const NON_REASONING_MODEL = 'minimax/minimax-m2.5';

describe('thinking-defaults — constants', () => {
  it('covers every task in THINKING_CONFIG_DEFAULTS', () => {
    for (const task of THINKING_TASKS) {
      expect(THINKING_CONFIG_DEFAULTS[task]).toBeTruthy();
      expect(THINKING_CONFIG_DEFAULTS[task].budgetTokens).toBeGreaterThan(0);
    }
  });

  it('covers every level in THINKING_BUDGET_BY_LEVEL', () => {
    for (const level of THINKING_LEVELS) {
      expect(THINKING_BUDGET_BY_LEVEL[level]).toBeGreaterThanOrEqual(0);
    }
    expect(THINKING_BUDGET_BY_LEVEL.off).toBe(0);
  });

  it('keeps budget bounds sensible (min < max; min ≥ Anthropic floor 1024)', () => {
    expect(THINKING_BUDGET_MIN_TOKENS).toBeGreaterThanOrEqual(1024);
    expect(THINKING_BUDGET_MIN_TOKENS).toBeLessThan(THINKING_BUDGET_MAX_TOKENS);
  });

  it('THINKING_OFF is frozen to level=off, budgetTokens=0', () => {
    expect(THINKING_OFF).toEqual({ level: 'off', budgetTokens: 0 });
  });
});

describe('resolveThinkingConfig — capability gate', () => {
  it('returns THINKING_OFF when model does not support reasoning (LOCKDOWN pin)', () => {
    expect(resolveThinkingConfig('design', NON_REASONING_MODEL)).toEqual(THINKING_OFF);
  });

  it('returns THINKING_OFF when modelId is missing', () => {
    expect(resolveThinkingConfig('design', undefined)).toEqual(THINKING_OFF);
    expect(resolveThinkingConfig('design', null)).toEqual(THINKING_OFF);
    expect(resolveThinkingConfig('design', '')).toEqual(THINKING_OFF);
  });

  it('returns THINKING_OFF even when an override asks for thinking on a non-reasoning model', () => {
    const result = resolveThinkingConfig('design', NON_REASONING_MODEL, {
      level: 'high',
      budgetTokens: 16384,
    });
    expect(result).toEqual(THINKING_OFF);
  });
});

describe('resolveThinkingConfig — task defaults', () => {
  for (const task of THINKING_TASKS) {
    it(`returns the default config for task=${task} on a reasoning model`, () => {
      expect(resolveThinkingConfig(task, REASONING_MODEL)).toEqual(
        THINKING_CONFIG_DEFAULTS[task],
      );
    });
  }
});

describe('resolveThinkingConfig — overrides', () => {
  it('level-only override keeps the task default budget', () => {
    const result = resolveThinkingConfig('design', REASONING_MODEL, { level: 'low' });
    expect(result).toEqual({ level: 'low', budgetTokens: THINKING_CONFIG_DEFAULTS.design.budgetTokens });
  });

  it('budget-only override keeps the task default level', () => {
    const result = resolveThinkingConfig('inputs', REASONING_MODEL, { budgetTokens: 4096 });
    expect(result).toEqual({ level: THINKING_CONFIG_DEFAULTS.inputs.level, budgetTokens: 4096 });
  });

  it('both overrides are honored', () => {
    const result = resolveThinkingConfig('evaluator', REASONING_MODEL, {
      level: 'high',
      budgetTokens: 12_000,
    });
    expect(result).toEqual({ level: 'high', budgetTokens: 12_000 });
  });

  it('level=off coerces budget to 0 regardless of override', () => {
    expect(
      resolveThinkingConfig('design', REASONING_MODEL, { level: 'off', budgetTokens: 8192 }),
    ).toEqual(THINKING_OFF);
  });
});

describe('resolveThinkingConfig — budget clamp', () => {
  it('clamps under-floor budgets to MIN', () => {
    const result = resolveThinkingConfig('design', REASONING_MODEL, { budgetTokens: 100 });
    expect(result.budgetTokens).toBe(THINKING_BUDGET_MIN_TOKENS);
  });

  it('clamps over-ceiling budgets to MAX', () => {
    const result = resolveThinkingConfig('design', REASONING_MODEL, { budgetTokens: 999_999 });
    expect(result.budgetTokens).toBe(THINKING_BUDGET_MAX_TOKENS);
  });

  it('rounds fractional budgets', () => {
    const result = resolveThinkingConfig('design', REASONING_MODEL, { budgetTokens: 2048.6 });
    expect(result.budgetTokens).toBe(2049);
  });

  it('treats NaN / Infinity as MIN', () => {
    const nanResult = resolveThinkingConfig('design', REASONING_MODEL, { budgetTokens: Number.NaN });
    expect(nanResult.budgetTokens).toBe(THINKING_BUDGET_MIN_TOKENS);
    const infResult = resolveThinkingConfig('design', REASONING_MODEL, {
      budgetTokens: Number.POSITIVE_INFINITY,
    });
    expect(infResult.budgetTokens).toBe(THINKING_BUDGET_MAX_TOKENS);
  });
});
