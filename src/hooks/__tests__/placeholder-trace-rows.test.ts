import { describe, expect, it } from 'vitest';
import { AGENTIC_PHASE } from '../../constants/agentic-stream';
import {
  traceRowAgenticPhase,
  traceRowEvaluationProgress,
  traceRowEvaluationReport,
} from '../placeholder-trace-rows';

describe('placeholder-trace-rows', () => {
  it('traceRowAgenticPhase sets kind and label for building', () => {
    const row = traceRowAgenticPhase(AGENTIC_PHASE.BUILDING);
    expect(row.kind).toBe('phase');
    expect(row.phase).toBe(AGENTIC_PHASE.BUILDING);
    expect(row.label).toBe('Build phase');
    expect(row.status).toBe('info');
  });

  it('traceRowEvaluationProgress joins message and round', () => {
    const row = traceRowEvaluationProgress(2, 'rubrics', 'ok');
    expect(row.kind).toBe('evaluation_progress');
    expect(row.round).toBe(2);
    expect(row.label).toContain('round 2');
  });

  it('traceRowEvaluationReport warns when hard fails', () => {
    const row = traceRowEvaluationReport(1, '3.0', 1);
    expect(row.status).toBe('warning');
    const ok = traceRowEvaluationReport(1, '3.0', 0);
    expect(ok.status).toBe('success');
  });
});
