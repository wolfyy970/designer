import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import rawThresholds from '../../../config/evaluation-thresholds.json';
import {
  REVISION_GATE_CRITICAL_SCORE_MAX,
  REVISION_GATE_LOW_AVERAGE_THRESHOLD,
  MAX_REVISION_ROUNDS_CAP,
  EvaluationThresholdsFileSchema,
} from '../evaluation-revision-gate.ts';

describe('evaluation-revision-gate constants', () => {
  it('exports stable threshold values used by enforceRevisionGate', () => {
    expect(REVISION_GATE_CRITICAL_SCORE_MAX).toBe(2);
    expect(REVISION_GATE_LOW_AVERAGE_THRESHOLD).toBe(3.5);
  });

  it('exports MAX_REVISION_ROUNDS_CAP', () => {
    expect(MAX_REVISION_ROUNDS_CAP).toBeGreaterThan(0);
  });
});

describe('evaluation-thresholds.json', () => {
  it('round-trips through EvaluationThresholdsFileSchema', () => {
    expect(EvaluationThresholdsFileSchema.safeParse(rawThresholds).success).toBe(true);
  });

  it('rejects a negative criticalScoreMax', () => {
    const bad = { ...rawThresholds, revisionGate: { ...rawThresholds.revisionGate, criticalScoreMax: -1 } };
    expect(() => EvaluationThresholdsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects maxRevisionRoundsCap < 1', () => {
    const bad = { ...rawThresholds, maxRevisionRoundsCap: 0 };
    expect(() => EvaluationThresholdsFileSchema.parse(bad)).toThrow(z.ZodError);
  });

  it('rejects unknown top-level keys', () => {
    const bad = { ...rawThresholds, unexpected: true };
    expect(() => EvaluationThresholdsFileSchema.parse(bad)).toThrow(z.ZodError);
  });
});
