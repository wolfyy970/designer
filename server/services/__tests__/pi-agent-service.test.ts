import { describe, it, expect } from 'vitest';
import { buildModel, maxCompletionBudgetForContextWindow } from '../pi-model.ts';

describe('buildModel', () => {
  describe('reasoning flag', () => {
    it('is false when thinkingLevel is undefined', () => {
      expect(buildModel('openrouter', 'some-model').reasoning).toBe(false);
    });

    it('is false when thinkingLevel is "off"', () => {
      expect(buildModel('openrouter', 'some-model', 'off').reasoning).toBe(false);
    });

    it('is true for "minimal"', () => {
      expect(buildModel('openrouter', 'some-model', 'minimal').reasoning).toBe(true);
    });

    it('is true for "low"', () => {
      expect(buildModel('openrouter', 'some-model', 'low').reasoning).toBe(true);
    });

    it('is true for "medium"', () => {
      expect(buildModel('openrouter', 'some-model', 'medium').reasoning).toBe(true);
    });

    it('is true for "high"', () => {
      expect(buildModel('openrouter', 'some-model', 'high').reasoning).toBe(true);
    });
  });

  describe('provider routing', () => {
    it('sets provider to lmstudio and uses LM Studio baseUrl', () => {
      const model = buildModel('lmstudio', 'qwen3-coder');
      expect(model.provider).toBe('lmstudio');
      expect(model.baseUrl).toMatch(/\/v1$/);
    });

    it('sets provider to openrouter and uses OpenRouter baseUrl', () => {
      const model = buildModel('openrouter', 'anthropic/claude-sonnet-4-5');
      expect(model.provider).toBe('openrouter');
      expect(model.baseUrl).toMatch(/\/api\/v1$/);
    });

    it('defaults to openrouter for unknown providerId', () => {
      expect(buildModel('unknown-provider', 'some-model').provider).toBe('openrouter');
    });
  });

  describe('model identity', () => {
    it('passes modelId through as id and name', () => {
      const model = buildModel('openrouter', 'anthropic/claude-3.5-sonnet', 'minimal');
      expect(model.id).toBe('anthropic/claude-3.5-sonnet');
      expect(model.name).toBe('anthropic/claude-3.5-sonnet');
    });
  });
});

describe('maxCompletionBudgetForContextWindow', () => {
  it('returns a positive budget for large context windows', () => {
    const n = maxCompletionBudgetForContextWindow(128_000);
    expect(n).toBeGreaterThan(4096);
  });
});
