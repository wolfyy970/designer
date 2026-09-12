/**
 * Orchestration tests for `runHypothesisGenerateFlow` — the function the
 * canvas calls when you press **Design**.
 *
 * Deliberately uses the REAL Zustand stores and mocks only the two true
 * boundaries (the `src/api/client` network calls and the run executor), so
 * these tests exercise the flow's actual reads/writes, its edge-status and
 * abort-controller lifecycle, and its three error branches. Mocking the stores
 * instead would assert the wiring rather than the behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/client', () => ({
  fetchHypothesisPromptBundle: vi.fn(),
  generateHypothesisStream: vi.fn(),
}));

vi.mock('../hypothesis-generation-run', () => ({
  executeHypothesisGenerationRun: vi.fn(),
  applyGenerationFailureToLanes: vi.fn(),
}));

import { runHypothesisGenerateFlow } from '../hypothesis-generate-flow';
import {
  executeHypothesisGenerationRun,
  applyGenerationFailureToLanes,
} from '../hypothesis-generation-run';
import { useCanvasStore } from '../../stores/canvas-store';
import { useGenerationStore } from '../../stores/generation-store';
import { useIncubatorStore } from '../../stores/incubator-store';
import { useTaskConfigStore } from '../../stores/task-config-store';
import { useWorkspaceDomainStore } from '../../stores/workspace-domain-store';
import { GENERATION_STATUS } from '../../constants/generation';
import { EDGE_STATUS } from '../../constants/canvas';
import { GENERATION_STOPPED_MESSAGE } from '../../lib/generation-abort-registry';
import type { HypothesisStrategy } from '../../types/incubator';
import type { DesignSpec } from '../../types/spec';
import type { GenerationResult } from '../../types/provider';

const STRATEGY_ID = 'vs-1';
const NODE_ID = 'hyp-1';

const strategy = {
  id: STRATEGY_ID,
  name: 'Instant resume',
  hypothesis: 'Readers resume faster when position is ambient.',
  rationale: 'r',
  measurements: 'm',
  dimensionValues: {},
} as unknown as HypothesisStrategy;

const spec = { id: 'spec-1' } as unknown as DesignSpec;

/** Collects every call the flow makes back into the component. */
function harness() {
  return {
    fitView: vi.fn(),
    setCompiledPrompts: vi.fn(),
    setGenerating: vi.fn(),
    addResult: vi.fn(),
    updateResult: vi.fn(),
    syncAfterGenerate: vi.fn(),
    setEdgeStatusBySource: vi.fn(),
    setEdgeStatusByTarget: vi.fn(),
    clearPreviewNodeIdMap: vi.fn(),
    setGenerationProgress: vi.fn(),
    setGenerationError: vi.fn(),
  };
}

type Harness = ReturnType<typeof harness>;

function run(h: Harness) {
  return runHypothesisGenerateFlow({
    nodeId: NODE_ID,
    strategyId: STRATEGY_ID,
    strategy,
    spec,
    lockdown: false,
    ...h,
  });
}

/** Seed the real stores with the minimum a run needs. */
function seedStores(opts: { blankModel?: boolean } = {}): void {
  useTaskConfigStore.setState({
    overrides: {
      // An explicit empty override is the ONLY way to reach the "no model
      // selected" guard: `getEffective` falls back to config/task-defaults.json,
      // whose non-empty values are enforced by a Zod parse at module load.
      design: opts.blankModel
        ? { providerId: '', modelId: '' }
        : { providerId: 'openrouter', modelId: 'm-1', level: 'medium' },
    },
  } as never);
  useIncubatorStore.setState({
    incubationPlans: {
      inc: {
        id: 'inc',
        dimensions: [{ name: 'axis', range: 'a..b', isConstant: false }],
        hypotheses: [strategy],
      },
    },
  } as never);
  useCanvasStore.setState({
    nodes: [{ id: NODE_ID, type: 'hypothesis', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
    previewNodeIdMap: new Map(),
  } as never);
  useWorkspaceDomainStore.setState({ hypotheses: {}, designSystems: {} } as never);
  useGenerationStore.setState({ results: [] } as never);
}

beforeEach(() => {
  // resetAllMocks, not clearAllMocks: this suite re-arms per test and some
  // tests rely on the previous implementation not leaking through.
  vi.resetAllMocks();
  seedStores();
});

describe('runHypothesisGenerateFlow — guard clauses', () => {
  it('errors out without touching the network when the model resolves empty', async () => {
    seedStores({ blankModel: true });
    const h = harness();

    await run(h);

    expect(h.setGenerationError).toHaveBeenCalledWith(
      expect.stringContaining('No model selected'),
    );
    // Bailed before the edge status / stream machinery.
    expect(h.setEdgeStatusBySource).not.toHaveBeenCalled();
    expect(h.setGenerating).not.toHaveBeenCalled();
    expect(executeHypothesisGenerationRun).not.toHaveBeenCalled();
  });
});

describe('runHypothesisGenerateFlow — success path', () => {
  it('sets processing, forwards the payload, and completes on success', async () => {
    vi.mocked(executeHypothesisGenerationRun).mockImplementation(async (deps) => {
      // The flow must hand the executor a credential derived from Settings.
      expect(deps.workspacePayload.hypothesisNodeId).toBe(NODE_ID);
      expect(deps.workspacePayload.settingsCredential).toEqual({
        providerId: 'openrouter',
        modelId: 'm-1',
        thinkingLevel: 'medium',
      });
      // Incubation plan dimensions are threaded through from the store.
      expect(deps.workspacePayload.dimensions).toEqual([
        { name: 'axis', range: 'a..b', isConstant: false },
      ]);
      // The abort signal is live so Stop can cancel the run.
      expect(deps.signal.aborted).toBe(false);
      return { ok: true, laneCount: 1 };
    });
    const h = harness();

    await run(h);

    expect(h.setEdgeStatusBySource).toHaveBeenCalledWith(NODE_ID, EDGE_STATUS.PROCESSING);
    expect(h.setGenerationError).toHaveBeenCalledWith(null);
    expect(h.setGenerating).toHaveBeenCalledWith(true);
    expect(h.setGenerationProgress).toHaveBeenCalledWith({ completed: 0, total: 1 });
    // finally: no lane errors, so the source edge settles COMPLETE.
    expect(h.setEdgeStatusBySource).toHaveBeenLastCalledWith(NODE_ID, EDGE_STATUS.COMPLETE);
    // finally: no work left in flight.
    expect(h.setGenerating).toHaveBeenLastCalledWith(false);
    expect(h.clearPreviewNodeIdMap).toHaveBeenCalled();
  });

  it('reports an error and marks the edge failed when the server returns no prompt', async () => {
    vi.mocked(executeHypothesisGenerationRun).mockResolvedValue({ ok: false, reason: 'no_prompt' });
    const h = harness();

    await run(h);

    expect(h.setGenerationError).toHaveBeenCalledWith('No prompt from server');
    expect(h.setEdgeStatusBySource).toHaveBeenCalledWith(NODE_ID, EDGE_STATUS.ERROR);
    // Same guard as the generic-failure test: the `finally` block settles the
    // edge COMPLETE unless the terminal-error flag was set, so the LAST call is
    // what matters.
    expect(h.setEdgeStatusBySource).toHaveBeenLastCalledWith(NODE_ID, EDGE_STATUS.ERROR);
    expect(h.setGenerating).toHaveBeenCalledWith(false);
    // No lane ids were ever handed back, so nothing to fail-mark.
    expect(applyGenerationFailureToLanes).not.toHaveBeenCalled();
  });
});

describe('runHypothesisGenerateFlow — failure paths', () => {
  it('treats an abort as a clean stop, not an error', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.mocked(executeHypothesisGenerationRun).mockRejectedValue(abortErr);
    const h = harness();

    await run(h);

    // A user-pressed Stop clears any error and settles the edge COMPLETE.
    expect(h.setGenerationError).toHaveBeenCalledWith(null);
    expect(h.setEdgeStatusBySource).toHaveBeenCalledWith(NODE_ID, EDGE_STATUS.COMPLETE);
    expect(h.setEdgeStatusBySource).not.toHaveBeenCalledWith(NODE_ID, EDGE_STATUS.ERROR);
    expect(applyGenerationFailureToLanes).toHaveBeenCalledWith(
      [],
      GENERATION_STOPPED_MESSAGE,
      expect.any(Function),
      h.updateResult,
    );
  });

  it('surfaces a generic failure and leaves the edge errored', async () => {
    vi.mocked(executeHypothesisGenerationRun).mockRejectedValue(new Error('upstream exploded'));
    const h = harness();

    await run(h);

    expect(h.setGenerationError).toHaveBeenCalledWith('upstream exploded');
    expect(h.setEdgeStatusBySource).toHaveBeenCalledWith(NODE_ID, EDGE_STATUS.ERROR);
    // Critical: the `finally` block normally settles the edge COMPLETE, and only
    // skips that when the terminal-error flag was set. Asserting the LAST call
    // (not merely that ERROR was reported once) is what catches the flag being
    // dropped — otherwise the failed edge silently repaints as a healthy one.
    expect(h.setEdgeStatusBySource).toHaveBeenLastCalledWith(NODE_ID, EDGE_STATUS.ERROR);
    // The stale-preview map is still cleared so the next run starts clean.
    expect(h.clearPreviewNodeIdMap).toHaveBeenCalled();
  });

  it('treats any lane error as a total failure, since there is one credential', async () => {
    // `n` is `genCtx.modelCredentials.length`, and the flow always builds
    // exactly one credential from Settings. So `errorCount === n` for any
    // single lane error and the `'${errorCount} of ${n} failed'` partial copy
    // is unreachable here — every non-lost-connection failure reads
    // "Generation failed". Pinned so a future multi-credential change to the
    // flow is a deliberate, visible decision rather than a silent behaviour
    // shift in user-facing copy.
    const laneResults: GenerationResult[] = [
      { id: 'l1', strategyId: STRATEGY_ID, status: GENERATION_STATUS.ERROR, error: 'boom' },
      { id: 'l2', strategyId: STRATEGY_ID, status: GENERATION_STATUS.COMPLETE },
    ] as GenerationResult[];

    vi.mocked(executeHypothesisGenerationRun).mockImplementation(async (deps) => {
      useGenerationStore.setState({ results: laneResults } as never);
      deps.onLaneIdsReady(laneResults.map((r) => r.id));
      return { ok: true, laneCount: 2 };
    });
    const h = harness();

    await run(h);

    expect(h.setGenerationError).toHaveBeenLastCalledWith('Generation failed');
  });

  it('reports a lost connection distinctly when every credential lost the stream', async () => {
    const { LOST_STREAM_CONNECTION_MESSAGE } = await import('../../api/client-sse-lifecycle');
    const laneResults: GenerationResult[] = [
      {
        id: 'l1',
        strategyId: STRATEGY_ID,
        status: GENERATION_STATUS.ERROR,
        error: LOST_STREAM_CONNECTION_MESSAGE,
      },
    ] as GenerationResult[];

    vi.mocked(executeHypothesisGenerationRun).mockImplementation(async (deps) => {
      useGenerationStore.setState({ results: laneResults } as never);
      deps.onLaneIdsReady(laneResults.map((r) => r.id));
      return { ok: true, laneCount: 1 };
    });
    const h = harness();

    await run(h);

    // errorCount (1) === n (1) and every message is the lost-connection copy →
    // the non-resumable wording, not the generic total-failure wording.
    expect(h.setGenerationError).toHaveBeenLastCalledWith(LOST_STREAM_CONNECTION_MESSAGE);
  });

  it('reports "Generation failed" when all credentials failed for other reasons', async () => {
    const laneResults: GenerationResult[] = [
      { id: 'l1', strategyId: STRATEGY_ID, status: GENERATION_STATUS.ERROR, error: 'boom' },
    ] as GenerationResult[];

    vi.mocked(executeHypothesisGenerationRun).mockImplementation(async (deps) => {
      useGenerationStore.setState({ results: laneResults } as never);
      deps.onLaneIdsReady(laneResults.map((r) => r.id));
      return { ok: true, laneCount: 1 };
    });
    const h = harness();

    await run(h);

    // Same count as the lost-connection case, but the message differs — that is
    // the distinction the non-resumable copy depends on.
    expect(h.setGenerationError).toHaveBeenLastCalledWith('Generation failed');
  });

  it('excludes lanes from other strategies when counting failures', async () => {
    // This lane error is registered but belongs to another strategy, so the
    // `r.strategyId === strategyId` filter drops it. Two ways to observe the
    // filter working: the run must not be upgraded to a total failure, and a
    // lone foreign error must not produce an error banner at all.
    const laneResults: GenerationResult[] = [
      { id: 'other', strategyId: 'vs-OTHER', status: GENERATION_STATUS.ERROR, error: 'boom' },
    ] as GenerationResult[];

    vi.mocked(executeHypothesisGenerationRun).mockImplementation(async (deps) => {
      useGenerationStore.setState({ results: laneResults } as never);
      deps.onLaneIdsReady(laneResults.map((r) => r.id));
      return { ok: true, laneCount: 1 };
    });
    const h = harness();

    await run(h);

    // No in-strategy errors → the error banner is never set from the tally.
    expect(h.setGenerationError).not.toHaveBeenCalledWith('Generation failed');
    expect(h.setGenerationError).toHaveBeenLastCalledWith(null);
  });

  it('ignores a lane error whose message is the stopped copy', async () => {
    const laneResults: GenerationResult[] = [
      {
        id: 'l1',
        strategyId: STRATEGY_ID,
        status: GENERATION_STATUS.ERROR,
        error: GENERATION_STOPPED_MESSAGE,
      },
    ] as GenerationResult[];

    vi.mocked(executeHypothesisGenerationRun).mockImplementation(async (deps) => {
      useGenerationStore.setState({ results: laneResults } as never);
      deps.onLaneIdsReady(laneResults.map((r) => r.id));
      return { ok: true, laneCount: 1 };
    });
    const h = harness();

    await run(h);

    // A user-stopped lane is excluded from the error tally, so no error banner.
    expect(h.setGenerationError).not.toHaveBeenCalledWith('Generation failed');
    expect(h.setGenerationError).toHaveBeenLastCalledWith(null);
  });
});
