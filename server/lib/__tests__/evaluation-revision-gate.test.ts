import { describe, expect, it } from 'vitest';
import {
  REVISION_GATE_CRITICAL_SCORE_MAX,
  REVISION_GATE_LOW_AVERAGE_THRESHOLD,
} from '../evaluation-revision-gate.ts';

describe('evaluation-revision-gate constants', () => {
  it('exports stable threshold values used by enforceRevisionGate', () => {
    expect(REVISION_GATE_CRITICAL_SCORE_MAX).toBe(2);
    expect(REVISION_GATE_LOW_AVERAGE_THRESHOLD).toBe(3.5);
  });
});
