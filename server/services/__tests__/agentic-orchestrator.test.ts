import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgenticWithEvaluation } from '../agentic-orchestrator.ts';
import { buildRevisionUserContext } from '../../lib/agentic-revision-user.ts';
import { EVALUATOR_RUBRIC_IDS, type EvaluatorWorkerReport } from '../../../src/types/evaluation.ts';
import {
  buildDegradedReport,
  type EvaluationRoundInput,
} from '../design-evaluation-service.ts';

const mocks = vi.hoisted(() => ({
  runDesignAgentSession: vi.fn(),
  runEvaluationWorkers: vi.fn(),
}));

vi.mock('../agent-runtime.ts', () => ({
  runDesignAgentSession: mocks.runDesignAgentSession,
}));

vi.mock('../../lib/build-agentic-system-context.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/build-agentic-system-context.ts')>();
  return {
    ...actual,
    buildAgenticSystemContext: vi.fn().mockResolvedValue({
      systemPrompt: 'sys',
      sandboxSeedFiles: {},
      loadedSkills: [],
      skillCatalog: [],
    }),
  };
});

vi.mock('../design-evaluation-service.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../design-evaluation-service.ts')>();
  return {
    ...actual,
    runEvaluationWorkers: mocks.runEvaluationWorkers,
  };
});

function healthyReport(rubric: EvaluatorWorkerReport['rubric']): EvaluatorWorkerReport {
  return {
    rubric,
    scores: {
      a: { score: 4, notes: 'ok' },
      b: { score: 4, notes: 'ok' },
    },
    findings: [],
    hardFails: [],
  };
}

function failingReport(rubric: EvaluatorWorkerReport['rubric']): EvaluatorWorkerReport {
  return {
    rubric,
    scores: { weak: { score: 1, notes: 'fails gate' } },
    findings: [{ severity: 'high', summary: 'Problem', detail: 'Needs work' }],
    hardFails: [],
  };
}

/** All rubrics score 3 → gate requests revision (avg < 3.5) without hard fails. */
function marginalReport(rubric: EvaluatorWorkerReport['rubric']): EvaluatorWorkerReport {
  return {
    rubric,
    scores: {
      a: { score: 3, notes: 'marginal' },
      b: { score: 3, notes: 'marginal' },
    },
    findings: [],
    hardFails: [],
  };
}

describe('buildRevisionUserContext', () => {
  it('truncates long compiled prompt and includes hypothesis context', () => {
    const long = 'x'.repeat(5000);
    const body = buildRevisionUserContext(long, {
      strategyName: 'S',
      hypothesis: 'H',
      objectivesMetrics: 'O',
    });
    expect(body.length).toBeLessThan(long.length);
    expect(body).toContain('H');
    expect(body).toContain('S');
    expect(body).toContain('O');
    expect(body).toContain('preserve intent');
  });
});

describe('runAgenticWithEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseOpts = {
    build: {
      userPrompt: 'user',
      providerId: 'openrouter',
      modelId: 'test/model',
    },
    compiledPrompt: 'compiled full prompt',
    maxRevisionRounds: 5,
    getPromptBody: vi.fn().mockResolvedValue('eval system'),
    onStream: vi.fn(),
  };

  const allHealthy = () => ({
    design: healthyReport('design'),
    strategy: healthyReport('strategy'),
    implementation: healthyReport('implementation'),
    browser: healthyReport('browser'),
  });

  it('emits evaluation_worker_done once per rubric before evaluation_report', async () => {
    mocks.runDesignAgentSession.mockResolvedValueOnce({
      files: { 'index.html': '<html></html>' },
      todos: [],
    });
    mocks.runEvaluationWorkers.mockImplementation(async (input: EvaluationRoundInput) => {
      const bundle = allHealthy();
      EVALUATOR_RUBRIC_IDS.forEach((k) => {
        input.onWorkerDone?.(k, bundle[k]);
      });
      return bundle;
    });

    const events: { type?: string }[] = [];
    await runAgenticWithEvaluation({
      ...baseOpts,
      onStream: async (e) => {
        events.push(e as { type?: string });
      },
    });

    const types = events.map((e) => e.type);
    const firstReport = types.indexOf('evaluation_report');
    const workerDoneBeforeReport = types.filter(
      (t, i) => t === 'evaluation_worker_done' && i < firstReport,
    ).length;
    expect(workerDoneBeforeReport).toBe(4);
    expect(types.lastIndexOf('evaluation_worker_done')).toBeLessThan(firstReport);
  });

  it('stops after one evaluation round when scores pass revision gate', async () => {
    mocks.runDesignAgentSession.mockResolvedValueOnce({
      files: { 'index.html': '<html></html>' },
      todos: [],
    });
    mocks.runEvaluationWorkers.mockResolvedValue(allHealthy());

    const result = await runAgenticWithEvaluation(baseOpts);

    expect(result).not.toBeNull();
    expect(mocks.runDesignAgentSession).toHaveBeenCalledTimes(1);
    expect(mocks.runDesignAgentSession.mock.calls[0][0].skillCatalog).toEqual([]);
    expect(mocks.runEvaluationWorkers).toHaveBeenCalledTimes(1);
    expect(result?.rounds).toHaveLength(1);
    expect(result?.finalAggregate.shouldRevise).toBe(false);
  });

  it('skips evaluation workers when evaluationContext is null (single Pi build)', async () => {
    mocks.runDesignAgentSession.mockResolvedValueOnce({
      files: { 'index.html': '<html></html>' },
      todos: [],
    });

    const result = await runAgenticWithEvaluation({
      ...baseOpts,
      evaluationContext: null,
    });

    expect(result).not.toBeNull();
    expect(mocks.runDesignAgentSession).toHaveBeenCalledTimes(1);
    expect(mocks.runEvaluationWorkers).not.toHaveBeenCalled();
    expect(result?.rounds).toHaveLength(0);
    expect(result?.checkpoint.stopReason).toBe('build_only');
    expect(result?.checkpoint.totalRounds).toBe(0);
  });

  it('returns a checkpoint on the first result', async () => {
    mocks.runDesignAgentSession.mockResolvedValueOnce({
      files: { 'index.html': '<html></html>', 'styles.css': 'body{}' },
      todos: [],
    });
    mocks.runEvaluationWorkers.mockResolvedValue(allHealthy());

    const result = await runAgenticWithEvaluation(baseOpts);

    expect(result?.checkpoint).toBeDefined();
    expect(result?.checkpoint.totalRounds).toBe(1);
    expect(result?.checkpoint.filesWritten).toContain('index.html');
    expect(result?.checkpoint.filesWritten).toContain('styles.css');
  });

  it('runs one revision pass and a second evaluation round when gate requires revision', async () => {
    mocks.runDesignAgentSession
      .mockResolvedValueOnce({
        files: { 'index.html': '<html></html>' },
        todos: [],
      })
      .mockResolvedValueOnce({
        files: { 'index.html': '<html>revised</html>' },
        todos: [],
      });

    mocks.runEvaluationWorkers
      .mockResolvedValueOnce({
        design: failingReport('design'),
        strategy: healthyReport('strategy'),
        implementation: healthyReport('implementation'),
        browser: healthyReport('browser'),
      })
      .mockResolvedValueOnce(allHealthy());

    const result = await runAgenticWithEvaluation(baseOpts);

    expect(result).not.toBeNull();
    expect(mocks.runDesignAgentSession).toHaveBeenCalledTimes(2);
    expect(mocks.runEvaluationWorkers).toHaveBeenCalledTimes(2);
    expect(result?.rounds).toHaveLength(2);
    const secondUserPrompt = mocks.runDesignAgentSession.mock.calls[1][0].userPrompt as string;
    expect(secondUserPrompt).toContain('compiled full prompt');
    expect(secondUserPrompt).toContain('Original design request');
    expect(result?.checkpoint.totalRounds).toBe(2);
    expect(result?.checkpoint.revisionBriefApplied).toBeDefined();
  });

  it('returns null when build session yields no result', async () => {
    mocks.runDesignAgentSession.mockResolvedValueOnce(null);

    const result = await runAgenticWithEvaluation(baseOpts);

    expect(result).toBeNull();
    expect(mocks.runEvaluationWorkers).not.toHaveBeenCalled();
  });

  it('returns partial result when revision session yields no result', async () => {
    mocks.runDesignAgentSession
      .mockResolvedValueOnce({
        files: { 'index.html': '<html></html>' },
        todos: [],
      })
      .mockResolvedValueOnce(null);

    mocks.runEvaluationWorkers.mockResolvedValueOnce({
      design: failingReport('design'),
      strategy: healthyReport('strategy'),
      implementation: healthyReport('implementation'),
      browser: healthyReport('browser'),
    });

    const result = await runAgenticWithEvaluation(baseOpts);

    expect(result).not.toBeNull();
    expect(result?.checkpoint.stopReason).toBe('revision_failed');
    expect(mocks.runEvaluationWorkers).toHaveBeenCalledTimes(1);
    expect(mocks.runDesignAgentSession).toHaveBeenCalledTimes(2);
  });

  it('produces a final aggregate when one worker returns a degraded report', async () => {
    mocks.runDesignAgentSession
      .mockResolvedValueOnce({
        files: { 'index.html': '<html></html>' },
        todos: [],
      })
      .mockResolvedValueOnce({
        files: { 'index.html': '<html></html>' },
        todos: [],
      });

    mocks.runEvaluationWorkers
      .mockResolvedValueOnce({
        design: buildDegradedReport('design', new Error('parse failed')),
        strategy: healthyReport('strategy'),
        implementation: healthyReport('implementation'),
        browser: healthyReport('browser'),
      })
      .mockResolvedValueOnce(allHealthy());

    const result = await runAgenticWithEvaluation(baseOpts);

    expect(result).not.toBeNull();
    expect(result?.finalAggregate.hardFails.length).toBe(0);
    expect(result?.finalAggregate.shouldRevise).toBe(false);
    expect(result?.rounds[0].aggregate.hardFails.length).toBeGreaterThan(0);
    expect(result?.rounds[0].aggregate.shouldRevise).toBe(true);
  });

  it('passes browser worker hard fail through to aggregate and triggers revision gate', async () => {
    mocks.runDesignAgentSession
      .mockResolvedValueOnce({ files: { 'index.html': '<html></html>' }, todos: [] })
      .mockResolvedValueOnce({ files: { 'index.html': '<html>fixed</html>' }, todos: [] });

    const browserFailing = {
      rubric: 'browser' as const,
      scores: { js_runtime: { score: 1, notes: 'crash' } },
      findings: [],
      hardFails: [{ code: 'js_execution_failure', message: 'ReferenceError: go is not defined' }],
    };

    mocks.runEvaluationWorkers
      .mockResolvedValueOnce({
        design: healthyReport('design'),
        strategy: healthyReport('strategy'),
        implementation: healthyReport('implementation'),
        browser: browserFailing,
      })
      .mockResolvedValueOnce(allHealthy());

    const result = await runAgenticWithEvaluation(baseOpts);

    expect(result).not.toBeNull();
    expect(result?.rounds[0].browser?.rubric).toBe('browser');
    expect(result?.rounds[0].aggregate.hardFails.some((hf) => hf.source === 'browser')).toBe(true);
    expect(result?.rounds[0].aggregate.shouldRevise).toBe(true);
    expect(mocks.runDesignAgentSession).toHaveBeenCalledTimes(2);
  });

  it('runs multiple revision rounds until satisfied', async () => {
    mocks.runDesignAgentSession
      .mockResolvedValueOnce({ files: { 'index.html': '<html>v1</html>' }, todos: [] })
      .mockResolvedValueOnce({ files: { 'index.html': '<html>v2</html>' }, todos: [] })
      .mockResolvedValueOnce({ files: { 'index.html': '<html>v3</html>' }, todos: [] });

    mocks.runEvaluationWorkers
      .mockResolvedValueOnce({
        design: failingReport('design'),
        strategy: healthyReport('strategy'),
        implementation: healthyReport('implementation'),
        browser: healthyReport('browser'),
      })
      .mockResolvedValueOnce({
        design: failingReport('design'),
        strategy: healthyReport('strategy'),
        implementation: healthyReport('implementation'),
        browser: healthyReport('browser'),
      })
      .mockResolvedValueOnce(allHealthy());

    const result = await runAgenticWithEvaluation({
      ...baseOpts,
      maxRevisionRounds: 5,
    });

    expect(result).not.toBeNull();
    expect(mocks.runDesignAgentSession).toHaveBeenCalledTimes(3);
    expect(mocks.runEvaluationWorkers).toHaveBeenCalledTimes(3);
    expect(result?.rounds).toHaveLength(3);
    expect(result?.checkpoint.stopReason).toBe('satisfied');
    expect(result?.checkpoint.revisionAttempts).toBe(2);
  });

  it('stops with max_revisions when gate never clears', async () => {
    mocks.runDesignAgentSession
      .mockResolvedValue({ files: { 'index.html': '<html></html>' }, todos: [] });

    mocks.runEvaluationWorkers.mockResolvedValue({
      design: failingReport('design'),
      strategy: healthyReport('strategy'),
      implementation: healthyReport('implementation'),
      browser: healthyReport('browser'),
    });

    const result = await runAgenticWithEvaluation({
      ...baseOpts,
      maxRevisionRounds: 2,
    });

    expect(result).not.toBeNull();
    expect(result?.checkpoint.stopReason).toBe('max_revisions');
    expect(result?.checkpoint.revisionAttempts).toBe(2);
    expect(mocks.runDesignAgentSession).toHaveBeenCalledTimes(3);
    expect(mocks.runEvaluationWorkers).toHaveBeenCalledTimes(3);
  });

  it('exits without revision when minOverallScore overrides gate', async () => {
    mocks.runDesignAgentSession.mockResolvedValueOnce({
      files: { 'index.html': '<html></html>' },
      todos: [],
    });
    mocks.runEvaluationWorkers.mockResolvedValueOnce({
      design: marginalReport('design'),
      strategy: marginalReport('strategy'),
      implementation: marginalReport('implementation'),
      browser: marginalReport('browser'),
    });

    const result = await runAgenticWithEvaluation({
      ...baseOpts,
      minOverallScore: 2.5,
    });

    expect(result).not.toBeNull();
    expect(mocks.runDesignAgentSession).toHaveBeenCalledTimes(1);
    expect(mocks.runEvaluationWorkers).toHaveBeenCalledTimes(1);
    expect(result?.checkpoint.stopReason).toBe('satisfied');
    expect(result?.checkpoint.revisionAttempts).toBe(0);
  });

  it('runs revision when overall is below minOverallScore even if gate clears (shouldRevise false)', async () => {
    mocks.runDesignAgentSession
      .mockResolvedValueOnce({ files: { 'index.html': '<html></html>' }, todos: [] })
      .mockResolvedValueOnce({ files: { 'index.html': '<html>rev</html>' }, todos: [] });

    mocks.runEvaluationWorkers
      .mockResolvedValueOnce(allHealthy())
      .mockResolvedValueOnce(allHealthy());

    const result = await runAgenticWithEvaluation({
      ...baseOpts,
      maxRevisionRounds: 1,
      minOverallScore: 4.5,
    });

    expect(result).not.toBeNull();
    expect(mocks.runDesignAgentSession).toHaveBeenCalledTimes(2);
    expect(mocks.runEvaluationWorkers).toHaveBeenCalledTimes(2);
    expect(result?.checkpoint.stopReason).toBe('max_revisions');
    expect(result?.checkpoint.revisionAttempts).toBe(1);
  });

  it('passes evaluator provider/model override to runEvaluationWorkers', async () => {
    mocks.runDesignAgentSession.mockResolvedValueOnce({
      files: { 'index.html': '<html></html>' },
      todos: [],
    });
    mocks.runEvaluationWorkers.mockResolvedValue(allHealthy());

    await runAgenticWithEvaluation({
      ...baseOpts,
      evaluatorProviderId: 'openrouter',
      evaluatorModelId: 'anthropic/claude-3-haiku',
    });

    const callArgs = mocks.runEvaluationWorkers.mock.calls[0][0];
    expect(callArgs.evaluatorProviderId).toBe('openrouter');
    expect(callArgs.evaluatorModelId).toBe('anthropic/claude-3-haiku');
  });

  it('aborts cleanly when onStream throws during evaluation (SSE delivery failure)', async () => {
    mocks.runDesignAgentSession.mockResolvedValueOnce({
      files: { 'index.html': '<html></html>' },
      todos: [],
    });
    mocks.runEvaluationWorkers.mockResolvedValue(allHealthy());

    const ac = new AbortController();
    const result = await runAgenticWithEvaluation({
      ...baseOpts,
      build: { ...baseOpts.build, signal: ac.signal },
      onStream: async (e) => {
        if (typeof e === 'object' && e && 'type' in e && e.type === 'evaluation_progress') {
          throw new Error('sse write failed');
        }
      },
    });

    expect(result).not.toBeNull();
    expect(result?.checkpoint.stopReason).toBe('aborted');
    expect(ac.signal.aborted).toBe(false);
  });

  it('returns build checkpoint with stopReason aborted when Pi succeeds but delivery already aborted (preserves files)', async () => {
    const streamFailureCtrl = new AbortController();
    mocks.runDesignAgentSession.mockImplementation(async () => {
      streamFailureCtrl.abort();
      return {
        files: { 'index.html': '<html></html>' },
        todos: [],
        emittedFilePaths: ['index.html'],
      };
    });

    const result = await runAgenticWithEvaluation({
      ...baseOpts,
      streamFailureController: streamFailureCtrl,
      evaluationContext: null,
      onStream: vi.fn(),
    });

    expect(result).not.toBeNull();
    expect(result?.checkpoint.stopReason).toBe('aborted');
    expect(result?.files['index.html']).toBe('<html></html>');
    expect(mocks.runEvaluationWorkers).not.toHaveBeenCalled();
  });
});
