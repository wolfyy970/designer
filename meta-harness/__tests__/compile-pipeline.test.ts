import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncubationPlan } from '../../src/types/compiler.ts';
import { runCompilePipeline } from '../compile-pipeline.ts';
import type { MetaHarnessConfig } from '../schemas.ts';
import type { RunnerCallbacks } from '../runner-types.ts';
import { SimplifiedMetaHarnessTestCaseSchema } from '../test-case-hydrator.ts';

const stubCallbacks = (): RunnerCallbacks =>
  ({
    onPreflight: () => {},
    onIterationStart: () => {},
    onProposerStart: () => {},
    onProposerToolCall: () => {},
    onProposerDone: () => {},
    onTestCaseStart: () => {},
    onWireEvent: () => {},
    onTestCaseDone: () => {},
    onIterationDone: () => {},
    onComplete: () => {},
  }) as RunnerCallbacks;

vi.mock('../compile-step.ts', () => ({
  runCompileStep: vi.fn(),
}));

import { runCompileStep } from '../compile-step.ts';

const cfg: MetaHarnessConfig = {
  apiBaseUrl: 'http://127.0.0.1:3001/api',
  iterations: 1,
  proposerModel: 'm',
  proposerMaxToolRounds: 3,
  defaultCompilerProvider: 'openrouter',
  supportsVision: false,
};

describe('runCompilePipeline', () => {
  beforeEach(() => {
    vi.mocked(runCompileStep).mockReset();
  });
  afterEach(() => {
    vi.mocked(runCompileStep).mockReset();
  });

  it('returns plan and requestedCount; invokes compile callbacks', async () => {
    const plan = {
      id: 'p1',
      specId: 's',
      dimensions: [],
      hypotheses: [{ id: 'h1', name: 'H', hypothesis: 'x', rationale: '', measurements: '', dimensionValues: {} }],
      generatedAt: '2020-01-01T00:00:00.000Z',
      compilerModel: 'cm',
    } as IncubationPlan;
    vi.mocked(runCompileStep).mockResolvedValue(plan);

    const onCompileStart = vi.fn();
    const onCompileDone = vi.fn();
    const onWireEvent = vi.fn();
    const callbacks: RunnerCallbacks = {
      ...stubCallbacks(),
      onCompileStart,
      onCompileDone,
      onWireEvent,
    };

    const raw = {
      name: 'c1',
      spec: {
        title: 'T',
        sections: {
          'design-brief': 'brief',
          'existing-design': '',
          'research-context': '',
          'objectives-metrics': '',
          'design-constraints': '',
        },
      },
      model: { providerId: 'openrouter', modelId: 'x/y' },
      compile: { hypothesisCount: 3 },
    };

    const out = await runCompilePipeline({
      testCase: SimplifiedMetaHarnessTestCaseSchema.parse(raw),
      name: 'alpha',
      cfg,
      compileProvider: 'openrouter',
      compileModel: 'minimax/minimax-m2.5',
      compileHypothesisCountDefault: 99,
      apiBaseUrl: cfg.apiBaseUrl,
      callbacks,
    });

    expect(out.plan).toBe(plan);
    expect(out.requestedCount).toBe(3);
    expect(onCompileStart).toHaveBeenCalledWith('alpha', 3);
    expect(onCompileDone).toHaveBeenCalledWith('alpha', [{ name: 'H', id: 'h1' }]);
    expect(runCompileStep).toHaveBeenCalled();
  });

  it('throws when compile returns no hypotheses', async () => {
    const plan = {
      id: 'p1',
      specId: 's',
      dimensions: [],
      hypotheses: [],
      generatedAt: '2020-01-01T00:00:00.000Z',
      compilerModel: 'cm',
    } as IncubationPlan;
    vi.mocked(runCompileStep).mockResolvedValue(plan);

    const raw = {
      name: 'c0',
      spec: {
        title: 'T',
        sections: {
          'design-brief': 'b',
          'existing-design': '',
          'research-context': '',
          'objectives-metrics': '',
          'design-constraints': '',
        },
      },
      model: { providerId: 'openrouter', modelId: 'x/y' },
    };

    await expect(
      runCompilePipeline({
        testCase: SimplifiedMetaHarnessTestCaseSchema.parse(raw),
        name: 'n',
        cfg,
        compileProvider: 'openrouter',
        compileModel: 'm',
        compileHypothesisCountDefault: 3,
        apiBaseUrl: cfg.apiBaseUrl,
        callbacks: stubCallbacks(),
      }),
    ).rejects.toThrow(/no hypotheses/);
  });
});
