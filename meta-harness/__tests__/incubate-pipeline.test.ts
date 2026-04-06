import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncubationPlan } from '../../src/types/incubator.ts';
import { runIncubatePipeline } from '../incubate-pipeline.ts';
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

vi.mock('../incubate-step.ts', () => ({
  runIncubateStep: vi.fn(),
}));

import { runIncubateStep } from '../incubate-step.ts';

const cfg: MetaHarnessConfig = {
  apiBaseUrl: 'http://127.0.0.1:3001/api',
  iterations: 1,
  proposerModel: 'm',
  proposerMaxToolRounds: 3,
  defaultIncubatorProvider: 'openrouter',
  supportsVision: false,
};

describe('runIncubatePipeline', () => {
  beforeEach(() => {
    vi.mocked(runIncubateStep).mockReset();
  });
  afterEach(() => {
    vi.mocked(runIncubateStep).mockReset();
  });

  it('returns plan and requestedCount; invokes incubate callbacks', async () => {
    const plan = {
      id: 'p1',
      specId: 's',
      dimensions: [],
      hypotheses: [{ id: 'h1', name: 'H', hypothesis: 'x', rationale: '', measurements: '', dimensionValues: {} }],
      generatedAt: '2020-01-01T00:00:00.000Z',
      incubatorModel: 'cm',
    } as IncubationPlan;
    vi.mocked(runIncubateStep).mockResolvedValue(plan);

    const onIncubateStart = vi.fn();
    const onIncubateDone = vi.fn();
    const onWireEvent = vi.fn();
    const callbacks: RunnerCallbacks = {
      ...stubCallbacks(),
      onIncubateStart,
      onIncubateDone,
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
      incubate: { hypothesisCount: 3 },
    };

    const out = await runIncubatePipeline({
      testCase: SimplifiedMetaHarnessTestCaseSchema.parse(raw),
      name: 'alpha',
      cfg,
      incubateProvider: 'openrouter',
      incubateModel: 'minimax/minimax-m2.5',
      incubateHypothesisCountDefault: 99,
      apiBaseUrl: cfg.apiBaseUrl,
      callbacks,
    });

    expect(out.plan).toBe(plan);
    expect(out.requestedCount).toBe(3);
    expect(onIncubateStart).toHaveBeenCalledWith('alpha', 3);
    expect(onIncubateDone).toHaveBeenCalledWith('alpha', [{ name: 'H', id: 'h1' }]);
    expect(runIncubateStep).toHaveBeenCalled();
  });

  it('throws when incubate returns no hypotheses', async () => {
    const plan = {
      id: 'p1',
      specId: 's',
      dimensions: [],
      hypotheses: [],
      generatedAt: '2020-01-01T00:00:00.000Z',
      incubatorModel: 'cm',
    } as IncubationPlan;
    vi.mocked(runIncubateStep).mockResolvedValue(plan);

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
      runIncubatePipeline({
        testCase: SimplifiedMetaHarnessTestCaseSchema.parse(raw),
        name: 'n',
        cfg,
        incubateProvider: 'openrouter',
        incubateModel: 'm',
        incubateHypothesisCountDefault: 3,
        apiBaseUrl: cfg.apiBaseUrl,
        callbacks: stubCallbacks(),
      }),
    ).rejects.toThrow(/no hypotheses/);
  });
});
