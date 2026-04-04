import { describe, expect, it } from 'vitest';
import { AGENTIC_PHASE } from '../../constants/agentic-stream';
import type { EvaluatorWorkerReport } from '../../types/evaluation';
import {
  traceRowAgenticPhase,
  traceRowEvaluationProgress,
  traceRowEvaluationReport,
  traceRowEvaluationWorker,
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

  it('traceRowEvaluationReport status reflects degraded worker and hard fails', () => {
    expect(traceRowEvaluationReport(1, '3.0', 1, false).status).toBe('warning');
    expect(traceRowEvaluationReport(1, '3.0', 0, false).status).toBe('success');
    expect(traceRowEvaluationReport(1, '3.0', 0, true).status).toBe('error');
    expect(traceRowEvaluationReport(1, '3.0', 2, true).status).toBe('error');
  });

  it('traceRowEvaluationWorker marks degraded with error detail', () => {
    const degraded: EvaluatorWorkerReport = {
      rubric: 'design',
      scores: { evaluator_unavailable: { score: 0, notes: 'Worker failed: boom' } },
      findings: [
        { severity: 'high', summary: 'Evaluator worker failed', detail: 'Parse error at line 1' },
      ],
      hardFails: [{ code: 'evaluator_worker_error', message: 'boom' }],
    };
    const row = traceRowEvaluationWorker(2, 'design', degraded);
    expect(row.kind).toBe('evaluation_worker');
    expect(row.round).toBe(2);
    expect(row.status).toBe('error');
    expect(row.label).toContain('Design');
    expect(row.detail).toContain('Parse error');
  });

  it('traceRowEvaluationWorker succeeds with avg score in label', () => {
    const ok: EvaluatorWorkerReport = {
      rubric: 'strategy',
      scores: {
        a: { score: 6, notes: 'n' },
        b: { score: 8, notes: 'n' },
      },
      findings: [],
      hardFails: [],
    };
    const row = traceRowEvaluationWorker(1, 'strategy', ok);
    expect(row.kind).toBe('evaluation_worker');
    expect(row.status).toBe('success');
    expect(row.label).toMatch(/Strategy.*avg 7\.0/);
    expect(row.detail).toBeUndefined();
  });
});
