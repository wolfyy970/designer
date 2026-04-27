import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import rawConfig from '../../../config/thinking-defaults.json';
import {
  THINKING_CONFIG_DEFAULTS,
  THINKING_BUDGET_BY_LEVEL,
  THINKING_BUDGET_MIN_TOKENS,
  THINKING_BUDGET_MAX_TOKENS,
  THINKING_LEVELS,
  THINKING_TASKS,
  THINKING_OFF,
  ThinkingDefaultsFileSchema,
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

describe('thinking-defaults — JSON config file', () => {
  it('config/thinking-defaults.json round-trips cleanly through the file schema', () => {
    const result = ThinkingDefaultsFileSchema.safeParse(rawConfig);
    if (!result.success) {
      // Surface the Zod error so a future bad edit is immediately actionable.
      throw new Error(`config/thinking-defaults.json is malformed: ${result.error.message}`);
    }
    expect(result.success).toBe(true);
  });

  it('the shipped JSON defines every task slot', () => {
    for (const task of THINKING_TASKS) {
      expect(THINKING_CONFIG_DEFAULTS[task]).toBeDefined();
    }
  });

  it('the shipped JSON defines all six level budgets', () => {
    for (const level of THINKING_LEVELS) {
      expect(typeof THINKING_BUDGET_BY_LEVEL[level]).toBe('number');
    }
  });

  it('rejects a file missing a task slot', () => {
    const bad = {
      ...rawConfig,
      perTaskDefaults: {
        design: { level: 'high', budgetTokens: 16384 },
        // incubate, internal-context, inputs, design-system, evaluator missing
      },
    };
    expect(() => ThinkingDefaultsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects a file with a level outside the enum', () => {
    const bad = {
      ...rawConfig,
      perTaskDefaults: {
        ...rawConfig.perTaskDefaults,
        design: { level: 'extreme', budgetTokens: 16384 },
      },
    };
    expect(() => ThinkingDefaultsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects a file with a negative budget', () => {
    const bad = {
      ...rawConfig,
      perTaskDefaults: {
        ...rawConfig.perTaskDefaults,
        evaluator: { level: 'low', budgetTokens: -1 },
      },
    };
    expect(() => ThinkingDefaultsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects a file where budgetBounds.max < min', () => {
    const bad = {
      ...rawConfig,
      budgetBounds: { minTokens: 4096, maxTokens: 1024 },
    };
    expect(() => ThinkingDefaultsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects a file with an unknown top-level key', () => {
    const bad = { ...rawConfig, unexpected: true };
    expect(() => ThinkingDefaultsFileSchema.parse(bad)).toThrow(z.ZodError);
  });
});
