import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import rawWeights from '../../../config/rubric-weights.json';
import { DEFAULT_RUBRIC_WEIGHTS, EVALUATOR_RUBRIC_IDS } from '../../types/evaluation.ts';

describe('rubric-weights.json', () => {
  it('defines all four rubric keys', () => {
    for (const id of EVALUATOR_RUBRIC_IDS) {
      expect(typeof rawWeights[id as keyof typeof rawWeights]).toBe('number');
    }
  });

  it('all weights are non-negative', () => {
    for (const id of EVALUATOR_RUBRIC_IDS) {
      expect(rawWeights[id as keyof typeof rawWeights]).toBeGreaterThanOrEqual(0);
    }
  });

  it('DEFAULT_RUBRIC_WEIGHTS matches the JSON file', () => {
    for (const id of EVALUATOR_RUBRIC_IDS) {
      expect(DEFAULT_RUBRIC_WEIGHTS[id]).toBe(rawWeights[id as keyof typeof rawWeights]);
    }
  });

  it('rejects a negative weight', () => {
    const schema = z.object({ design: z.number().min(0), strategy: z.number().min(0), implementation: z.number().min(0), browser: z.number().min(0) }).strict();
    const bad = { ...rawWeights, design: -0.1 };
    expect(() => schema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects an unknown rubric key', () => {
    const schema = z.object({ design: z.number().min(0), strategy: z.number().min(0), implementation: z.number().min(0), browser: z.number().min(0) }).strict();
    const bad = { ...rawWeights, unknown: 0.1 };
    expect(() => schema.parse(bad)).toThrow(z.ZodError);
  });
});
