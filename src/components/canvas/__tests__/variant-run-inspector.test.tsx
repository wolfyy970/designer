/** @vitest-environment jsdom */
/**
 * `VariantRunInspector` — the side panel behind "Open run panel" on a preview
 * card. It held zero coverage despite owning six responsibilities and the
 * repo's highest cyclomatic complexity, and almost all of its user-visible
 * decisions come from `??` chains:
 *
 *   result         = activeResult ?? legacyResult(node.data.refId)
 *   currentFiles   = files ?? result.liveFiles
 *   designFiles    = currentFiles | roundFilesFromIdb ?? selectedRound.files ?? currentFiles
 *   singleFileSrc  = (generating ? result.liveCode ?? code : code)
 *   evalSummary    = selectedRound.aggregate ?? result.evaluationSummary
 *
 * Those chains decide *which artifact the user is looking at*, so the tests
 * below pin the ordering by asserting on rendered text and on the file map the
 * design frame actually received — not merely that something mounted.
 *
 * Stores are real (canvas / generation / incubator). Two boundaries are stubbed:
 *
 *   - `services/idb-storage` — `loadCode` / `loadFiles` / `loadRoundFiles` are
 *     the persistence boundary. Stubbing the module (rather than the
 *     `useResultCode` / `useResultFiles` hooks) keeps the real loading and
 *     precedence logic under test, including the loading states.
 *   - `hooks/useArtifactPreviewUrl` — the network boundary of
 *     `ArtifactPreviewFrame`. It is also the only way to observe *which* file
 *     map reached the multi-file preview, since jsdom never renders the frame.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DEFAULT_MODEL_ID, NON_DEFAULT_MODEL_ID } from '../../../test-support/model-fixtures';

/** Controllable IndexedDB boundary — reassigned per test. */
const idb = vi.hoisted(() => ({
  code: undefined as string | undefined,
  /** What `loadFiles` resolves with. `undefined` mimics "nothing stored". */
  files: undefined as Record<string, string> | undefined,
  /** When set, `loadFiles` returns this promise instead — used for loading states. */
  filesDeferred: undefined as Promise<Record<string, string> | undefined> | undefined,
  /** Per-round snapshots, keyed by round number. */
  roundFiles: {} as Record<number, Record<string, string> | undefined>,
  loadRoundFiles: vi.fn<(resultId: string, round: number) => void>(),
}));

vi.mock('../../../services/idb-storage', () => {
  const noop = async (): Promise<void> => {};
  return {
    ensureCanvasSnapshotStore: noop,
    saveCode: noop,
    loadCode: async () => idb.code,
    deleteCode: noop,
    clearAllCodes: noop,
    getCodeKeys: async () => [] as string[],
    saveProvenance: noop,
    loadProvenance: async () => undefined,
    deleteProvenance: noop,
    saveFiles: noop,
    loadFiles: async () => idb.filesDeferred ?? idb.files,
    deleteFiles: noop,
    saveRoundFiles: noop,
    loadRoundFiles: (resultId: string, round: number) => {
      idb.loadRoundFiles(resultId, round);
      return Promise.resolve(idb.roundFiles[round]);
    },
    roundFilesKey: (resultId: string, round: number) => `${resultId}:round:${round}`,
    deleteRoundFilesForResult: noop,
    clearAllFiles: noop,
    garbageCollect: async () => ({ deleted: [] as string[] }),
    saveCanvasSnapshot: noop,
    loadCanvasSnapshot: async () => undefined,
    deleteCanvasSnapshot: noop,
    garbageCollectCanvasSnapshots: async () => ({ deleted: [] as string[] }),
  };
});

/** Captures what `ArtifactPreviewFrame` asked the preview-URL layer to render. */
const preview = vi.hoisted(() => ({
  files: undefined as Record<string, string> | undefined,
  calls: 0,
}));

vi.mock('../../../hooks/useArtifactPreviewUrl', () => ({
  useArtifactPreviewUrl: (files: Record<string, string> | undefined) => {
    preview.files = files;
    preview.calls += 1;
    return {
      previewSrc: null,
      fallbackSrcDoc: '<!doctype html><html><body>bundled fallback</body></html>',
      isPending: false,
    };
  },
}));

import VariantRunInspector from '../VariantRunInspector';
import { useCanvasStore } from '../../../stores/canvas-store';
import { useGenerationStore } from '../../../stores/generation-store';
import { useIncubatorStore } from '../../../stores/incubator-store';
import { GENERATION_STATUS } from '../../../constants/generation';
import type { GenerationResult, GenerationStatus, RunTraceEvent } from '../../../types/provider';
import type {
  AggregatedEvaluationReport,
  EvaluationRoundSnapshot,
  EvaluatorRubricId,
  EvaluatorWorkerReport,
} from '../../../types/evaluation';
import type { WorkspaceNode } from '../../../types/workspace-graph';

const PREVIEW_ID = 'preview-1';
const OTHER_PREVIEW_ID = 'preview-2';
const STRATEGY_ID = 'vs-1';
const RESULT_ID = 'result-1';

const STRATEGY_NAME = 'Instant resume';

const strategy = {
  id: STRATEGY_ID,
  name: STRATEGY_NAME,
  hypothesis: 'h',
  rationale: 'r',
  measurements: 'm',
  dimensionValues: {},
};

/** The three empty-state sentences the panel can show for a bare run. */
const EMPTY_FILES_TEXT = 'No project files for this run.';
const EMPTY_DESIGN_TEXT = 'No preview available.';
const EMPTY_EVAL_TEXT = 'No evaluation data for this run.';

function result(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    id: RESULT_ID,
    strategyId: STRATEGY_ID,
    providerId: 'openrouter',
    status: GENERATION_STATUS.COMPLETE,
    runId: 'run-1',
    runNumber: 1,
    metadata: { model: DEFAULT_MODEL_ID },
    ...overrides,
  };
}

function aggregate(
  overrides: Partial<AggregatedEvaluationReport> = {},
): AggregatedEvaluationReport {
  return {
    overallScore: 7.5,
    normalizedScores: {},
    hardFails: [],
    prioritizedFixes: [],
    shouldRevise: false,
    revisionBrief: '',
    ...overrides,
  };
}

function round(
  roundNum: number,
  overrides: Partial<EvaluationRoundSnapshot> = {},
): EvaluationRoundSnapshot {
  return { round: roundNum, aggregate: aggregate(), ...overrides };
}

function worker(
  rubric: EvaluatorRubricId,
  scores: Record<string, number> = {},
): EvaluatorWorkerReport {
  return {
    rubric,
    scores: Object.fromEntries(
      Object.entries(scores).map(([k, v]) => [k, { score: v, notes: '' }]),
    ),
    findings: [],
    hardFails: [],
  };
}

function previewNode(
  id: string = PREVIEW_ID,
  data: Record<string, unknown> = { strategyId: STRATEGY_ID },
): WorkspaceNode {
  return { id, type: 'preview', position: { x: 0, y: 0 }, data } as WorkspaceNode;
}

/** Put a preview node on the canvas and select it for the run panel. */
function openRunPanel(node: WorkspaceNode = previewNode()) {
  useCanvasStore.setState({
    nodes: [node],
    runInspectorPreviewNodeId: node.id,
  } as never);
}

function setResults(...results: GenerationResult[]) {
  useGenerationStore.setState({
    results,
    selectedVersions: {},
    userBestOverrides: {},
  } as never);
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Preview run panel' });
}

function switchTab(label: 'Monitor' | 'Files' | 'Design' | 'Evaluation') {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
}

/** The identity row under the header title: `v…· model · duration · status`. */
function identityRow(): string {
  const statusWord = panel().querySelector('span.capitalize');
  return statusWord?.parentElement?.textContent ?? '';
}

/** The round `<select>`'s option labels, in order. */
function roundOptions(): string[] {
  const select = panel().querySelector('select');
  if (!select) return [];
  return Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
}

beforeEach(() => {
  idb.code = undefined;
  idb.files = undefined;
  idb.filesDeferred = undefined;
  idb.roundFiles = {};
  idb.loadRoundFiles.mockClear();
  preview.files = undefined;
  preview.calls = 0;

  useCanvasStore.setState({
    nodes: [],
    edges: [],
    runInspectorPreviewNodeId: null,
    previewNodeIdMap: new Map(),
  } as never);
  useGenerationStore.setState({
    results: [],
    selectedVersions: {},
    userBestOverrides: {},
  } as never);
  useIncubatorStore.setState({
    incubationPlans: { inc: { id: 'inc', dimensions: [], hypotheses: [strategy] } },
  } as never);
});

afterEach(() => {
  cleanup();
});

// ── Identity header ────────────────────────────────────────────────────

describe('VariantRunInspector — identity header', () => {
  it('shows the strategy name, version, model, duration and status in that order', async () => {
    setResults(
      result({ runNumber: 3, metadata: { model: DEFAULT_MODEL_ID, durationMs: 12345 } }),
    );
    openRunPanel();

    render(<VariantRunInspector />);

    expect(screen.getByRole('heading', { name: STRATEGY_NAME })).toBeTruthy();
    // 12345ms → toFixed(1) of 12.345 seconds.
    expect(await screen.findByText('12.3s')).toBeTruthy();
    expect(identityRow()).toBe(`v3·${DEFAULT_MODEL_ID}·12.3s·complete`);
  });

  it('labels the panel "Preview" when the strategy cannot be resolved', async () => {
    setResults(result({ strategyId: 'vs-unknown' }));
    openRunPanel(previewNode(PREVIEW_ID, { strategyId: 'vs-unknown' }));

    render(<VariantRunInspector />);

    expect(screen.getByRole('heading', { name: 'Preview' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: STRATEGY_NAME })).toBeNull();
  });

  it('shows metadata.model verbatim — no default substitution, no "(older run)" marker', async () => {
    setResults(result({ metadata: { model: NON_DEFAULT_MODEL_ID } }));
    openRunPanel();

    render(<VariantRunInspector />);

    expect(screen.getByText(NON_DEFAULT_MODEL_ID)).toBeTruthy();
    // The inspector has no notion of the effective default model: it never
    // renders the configured default and never flags a run as older. That
    // labeling lives in `nodes/VariantFooter.tsx`, not here.
    expect(screen.queryByText(DEFAULT_MODEL_ID)).toBeNull();
    expect(screen.queryByText('(older run)')).toBeNull();
  });

  it('drops the model segment — and its separator — when metadata.model is empty', async () => {
    setResults(result({ metadata: { model: '' } }));
    openRunPanel();

    render(<VariantRunInspector />);

    // Exactly two segments: no dangling separator where the model would be.
    expect(identityRow()).toBe('v1·complete');
  });

  it('omits the version chip for a legacy refId-only node, but still resolves the run', async () => {
    setResults(result());
    openRunPanel(previewNode(PREVIEW_ID, { refId: RESULT_ID }));

    render(<VariantRunInspector />);

    // The result is reached through `data.refId`…
    expect(screen.getByRole('heading', { name: STRATEGY_NAME })).toBeTruthy();
    // …but `versionKey` needs a strategyId, so no version chip is rendered. The
    // model's own separator is emitted regardless, leaving a dangling "·".
    expect(screen.queryByText('v1')).toBeNull();
    // No separator is emitted in place of the missing version chip.
    expect(identityRow()).toBe(`${DEFAULT_MODEL_ID}·complete`);
  });

  it('survives a result with no metadata, runNumber or rounds, and emits no dangling separator', async () => {
    const malformed = result({ evaluationRounds: [] });
    delete (malformed as { metadata?: unknown }).metadata;
    delete (malformed as { runNumber?: unknown }).runNumber;
    setResults(malformed);
    openRunPanel();

    render(<VariantRunInspector />);

    expect(screen.getByRole('heading', { name: STRATEGY_NAME })).toBeTruthy();
    // The separator before the status word is unconditional, so a run with no
    // version/model/duration renders one with nothing on its left.
    // Nothing to separate, so the row is just the status word.
    expect(identityRow()).toBe('complete');
    expect(screen.queryByText(DEFAULT_MODEL_ID)).toBeNull();
  });

  const STATUS_TONES: [GenerationStatus, string][] = [
    [GENERATION_STATUS.COMPLETE, 'bg-success'],
    [GENERATION_STATUS.GENERATING, 'bg-accent'],
    [GENERATION_STATUS.ERROR, 'bg-error'],
    [GENERATION_STATUS.PENDING, 'bg-fg-faint'],
  ];

  it.each(STATUS_TONES)('renders the %s status word with its %s dot tone', (status, tone) => {
    setResults(result({ status }));
    openRunPanel();

    render(<VariantRunInspector />);

    const dot = screen.getByText(status).querySelector('span');
    expect(dot?.className).toContain(tone);
    if (status === GENERATION_STATUS.GENERATING) {
      expect(dot?.className).toContain('animate-pulse');
    }
  });

  it('does not render the result error message in the run panel', () => {
    setResults(result({ status: GENERATION_STATUS.ERROR, error: 'upstream exploded' }));
    openRunPanel();

    render(<VariantRunInspector />);

    // The panel reports the status only; the message is the card's job.
    expect(screen.getByText(GENERATION_STATUS.ERROR)).toBeTruthy();
    expect(screen.queryByText(/upstream exploded/)).toBeNull();
  });
});

// ── Visibility and lifecycle ───────────────────────────────────────────

describe('VariantRunInspector — visibility and lifecycle', () => {
  it('renders nothing when no preview node is selected', () => {
    render(<VariantRunInspector />);

    expect(screen.queryByRole('complementary', { name: 'Preview run panel' })).toBeNull();
  });

  it('clears the selection when the selected node is not a preview node', () => {
    useCanvasStore.setState({
      nodes: [{ id: PREVIEW_ID, type: 'hypothesis', position: { x: 0, y: 0 }, data: {} }],
      runInspectorPreviewNodeId: PREVIEW_ID,
    } as never);

    render(<VariantRunInspector />);

    expect(useCanvasStore.getState().runInspectorPreviewNodeId).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Preview run panel' })).toBeNull();
  });

  it('clears the selection when the preview node leaves a non-empty graph', () => {
    useCanvasStore.setState({
      nodes: [previewNode(OTHER_PREVIEW_ID)],
      runInspectorPreviewNodeId: PREVIEW_ID,
    } as never);

    render(<VariantRunInspector />);

    expect(useCanvasStore.getState().runInspectorPreviewNodeId).toBeNull();
  });

  it('clears the selection on mount when the graph is empty (guarded effect is defeated)', () => {
    // Documents current behavior: the first effect deliberately does *not* close
    // while `nodes` is empty ("would immediately undo Open run panel"), but the
    // second effect closes in exactly that case.
    useCanvasStore.setState({ nodes: [], runInspectorPreviewNodeId: PREVIEW_ID } as never);

    render(<VariantRunInspector />);

    expect(useCanvasStore.getState().runInspectorPreviewNodeId).toBeNull();
  });

  it('closes on Escape', () => {
    setResults(result());
    openRunPanel();
    render(<VariantRunInspector />);
    expect(screen.getByRole('complementary', { name: 'Preview run panel' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(useCanvasStore.getState().runInspectorPreviewNodeId).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Preview run panel' })).toBeNull();
  });

  it('removes the Escape listener on unmount', () => {
    setResults(result());
    openRunPanel();
    const { unmount } = render(<VariantRunInspector />);
    unmount();

    useCanvasStore.setState({ runInspectorPreviewNodeId: PREVIEW_ID } as never);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(useCanvasStore.getState().runInspectorPreviewNodeId).toBe(PREVIEW_ID);
  });

  it('closes from the header close button', () => {
    setResults(result());
    openRunPanel();
    render(<VariantRunInspector />);

    fireEvent.click(screen.getByTitle('Close (Esc)'));

    expect(useCanvasStore.getState().runInspectorPreviewNodeId).toBeNull();
  });

  it('forwards onPointerEnter to the panel element', () => {
    const onPointerEnter = vi.fn();
    setResults(result());
    openRunPanel();
    render(<VariantRunInspector onPointerEnter={onPointerEnter} />);

    fireEvent.pointerEnter(panel());

    expect(onPointerEnter).toHaveBeenCalledTimes(1);
  });

  it('swallows wheel events so the canvas cannot zoom while the panel scrolls', () => {
    // The panel is an overlay above the React Flow canvas, which zooms on wheel.
    const onWheel = vi.fn();
    setResults(result());
    openRunPanel();
    render(
      <div onWheel={onWheel}>
        <span>canvas chrome</span>
        <VariantRunInspector />
      </div>,
    );

    // Control: the harness really does propagate wheel events to the wrapper.
    fireEvent.wheel(screen.getByText('canvas chrome'));
    expect(onWheel).toHaveBeenCalledTimes(1);

    fireEvent.wheel(panel());

    expect(onWheel).toHaveBeenCalledTimes(1);
  });
});

// ── Tabs ───────────────────────────────────────────────────────────────

describe('VariantRunInspector — tabs', () => {
  it('opens on Monitor and gives each tab its own body', async () => {
    setResults(result());
    openRunPanel();
    render(<VariantRunInspector />);

    expect(screen.getByText('Tasks')).toBeTruthy();
    expect(screen.getByText('No tasks.')).toBeTruthy();

    switchTab('Files');
    expect(await screen.findByText(EMPTY_FILES_TEXT)).toBeTruthy();
    expect(screen.queryByText('Tasks')).toBeNull();

    switchTab('Design');
    expect(await screen.findByText(EMPTY_DESIGN_TEXT)).toBeTruthy();
    expect(screen.queryByText(EMPTY_FILES_TEXT)).toBeNull();

    switchTab('Evaluation');
    expect(await screen.findByText(EMPTY_EVAL_TEXT)).toBeTruthy();
    expect(screen.queryByText(EMPTY_DESIGN_TEXT)).toBeNull();

    switchTab('Monitor');
    expect(screen.getByText('Tasks')).toBeTruthy();
    expect(screen.queryByText(EMPTY_EVAL_TEXT)).toBeNull();
  });

  it('resets to Monitor when a different preview is inspected', async () => {
    setResults(result());
    useCanvasStore.setState({
      nodes: [previewNode(PREVIEW_ID), previewNode(OTHER_PREVIEW_ID)],
      runInspectorPreviewNodeId: PREVIEW_ID,
    } as never);
    render(<VariantRunInspector />);

    switchTab('Files');
    expect(await screen.findByText(EMPTY_FILES_TEXT)).toBeTruthy();

    act(() => {
      useCanvasStore.setState({ runInspectorPreviewNodeId: OTHER_PREVIEW_ID } as never);
    });

    expect(screen.getByText('Tasks')).toBeTruthy();
    expect(screen.queryByText(EMPTY_FILES_TEXT)).toBeNull();
  });
});

// ── Which files are shown ──────────────────────────────────────────────

describe('VariantRunInspector — which files are shown', () => {
  it('prefers stored files over live streaming files', async () => {
    idb.files = { 'index.html': 'FROM-IDB' };
    setResults(result({ liveFiles: { 'index.html': 'FROM-LIVE' } }));
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Files');

    expect(await screen.findByText('FROM-IDB')).toBeTruthy();
    expect(screen.queryByText('FROM-LIVE')).toBeNull();

    switchTab('Design');
    await waitFor(() => expect(preview.files).toEqual({ 'index.html': 'FROM-IDB' }));
  });

  it('falls back to live files when nothing is stored', async () => {
    idb.files = undefined;
    setResults(result({ liveFiles: { 'index.html': 'FROM-LIVE' } }));
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Files');

    expect(await screen.findByText('FROM-LIVE')).toBeTruthy();
    expect(screen.queryByText(EMPTY_FILES_TEXT)).toBeNull();
  });

  it('does not flash the empty state while stored files are still loading', async () => {
    let resolveFiles: (files: Record<string, string>) => void = () => {};
    idb.filesDeferred = new Promise<Record<string, string> | undefined>((resolve) => {
      resolveFiles = (files) => resolve(files);
    });
    setResults(result());
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Files');
    // Loading gate: neither the empty state nor the explorer is shown yet.
    expect(screen.queryByText(EMPTY_FILES_TEXT)).toBeNull();

    await act(async () => {
      resolveFiles({ 'index.html': 'RESOLVED' });
    });

    expect(await screen.findByText('RESOLVED')).toBeTruthy();
  });

  it('lists planned-but-unwritten paths while generating and explains the gap', async () => {
    setResults(
      result({
        status: GENERATION_STATUS.GENERATING,
        liveFiles: { 'index.html': '<html>live body</html>' },
        liveFilesPlan: ['index.html', 'styles.css'],
        activeToolPath: 'styles.css',
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Files');
    expect(await screen.findByText('<html>live body</html>')).toBeTruthy();

    // The plan drives the explorer even for paths with no content yet, and the
    // writing file is flagged.
    //
    // The row's accessible name is the *filename*, not "Writing…": the dot used
    // to carry an aria-label, which replaces the button's name, so the control
    // was announced as "Writing…" and the file it selects was unidentifiable.
    const planned = screen.getByRole('button', { name: 'styles.css' });
    expect(planned).toBeTruthy();
    // The writing state is announced once, by a status region, instead.
    expect(screen.getByRole('status').textContent).toContain('Writing styles.css');

    fireEvent.pointerDown(planned);

    expect(
      screen.getByText('Not written yet — watch the Monitor stream for updates.'),
    ).toBeTruthy();
    expect(screen.queryByText(EMPTY_FILES_TEXT)).toBeNull();
  });

  it('shows the planning empty state while generating with no plan', async () => {
    setResults(result({ status: GENERATION_STATUS.GENERATING }));
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Files');
    expect(
      await screen.findByText('Paths appear here when the agent plans and writes files.'),
    ).toBeTruthy();
    expect(screen.queryByText(EMPTY_FILES_TEXT)).toBeNull();

    switchTab('Design');
    expect(await screen.findByText('Preview appears when the first artifact is ready.')).toBeTruthy();
  });

  it('never renders the round selector for a single-round run', async () => {
    idb.files = { 'index.html': 'ONE-ROUND' };
    setResults(
      result({
        evaluationRounds: [round(1, { files: { 'index.html': 'ROUND-1-INLINE' } })],
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Files');

    expect(await screen.findByText('ONE-ROUND')).toBeTruthy();
    expect(screen.queryByText('Eval round')).toBeNull();
    expect(panel().querySelector('select')).toBeNull();
    expect(idb.loadRoundFiles).not.toHaveBeenCalled();
  });

  it('shows the run files — not the snapshot — for the final round', async () => {
    idb.files = { 'index.html': 'LATEST-IDB' };
    setResults(
      result({
        evaluationRounds: [
          round(1, { files: { 'index.html': 'ROUND-1-INLINE' } }),
          round(2, { files: { 'index.html': 'ROUND-2-INLINE' } }),
        ],
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Files');

    expect(await screen.findByText('LATEST-IDB')).toBeTruthy();
    expect(roundOptions()).toEqual(['Round 1', 'Round 2 (final)']);
    expect((panel().querySelector('select') as HTMLSelectElement).value).toBe('1');
    expect(screen.queryByText('ROUND-2-INLINE')).toBeNull();
    expect(screen.queryByText('ROUND-1-INLINE')).toBeNull();
  });

  it('loads an older round snapshot from IndexedDB, outranking the inline snapshot', async () => {
    idb.files = { 'index.html': 'LATEST-IDB' };
    idb.roundFiles[1] = { 'index.html': 'ROUND-1-IDB' };
    setResults(
      result({
        evaluationRounds: [
          round(1, { files: { 'index.html': 'ROUND-1-INLINE' } }),
          round(2, { files: { 'index.html': 'ROUND-2-INLINE' } }),
        ],
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Files');
    await screen.findByText('LATEST-IDB');

    fireEvent.change(panel().querySelector('select') as HTMLSelectElement, {
      target: { value: '0' },
    });

    expect(await screen.findByText('ROUND-1-IDB')).toBeTruthy();
    expect(idb.loadRoundFiles).toHaveBeenCalledWith(RESULT_ID, 1);
    expect(screen.queryByText('ROUND-1-INLINE')).toBeNull();
    expect(screen.queryByText('LATEST-IDB')).toBeNull();
  });

  it('uses the inline round snapshot when IndexedDB has none', async () => {
    idb.files = { 'index.html': 'LATEST-IDB' };
    idb.roundFiles[1] = undefined;
    setResults(
      result({
        evaluationRounds: [
          round(1, { files: { 'index.html': 'ROUND-1-INLINE' } }),
          round(2, { files: { 'index.html': 'ROUND-2-INLINE' } }),
        ],
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Files');
    await screen.findByText('LATEST-IDB');

    fireEvent.change(panel().querySelector('select') as HTMLSelectElement, {
      target: { value: '0' },
    });

    expect(await screen.findByText('ROUND-1-INLINE')).toBeTruthy();
  });

  it('treats an empty inline round snapshot as authoritative', async () => {
    idb.files = { 'index.html': 'LATEST-IDB' };
    idb.roundFiles[1] = undefined;
    setResults(
      result({
        evaluationRounds: [
          // `{}` is not nullish, so the `??` chain stops here instead of
          // falling through to the run's files.
          round(1, { files: {} }),
          round(2, { files: { 'index.html': 'ROUND-2-INLINE' } }),
        ],
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Files');
    await screen.findByText('LATEST-IDB');

    fireEvent.change(panel().querySelector('select') as HTMLSelectElement, {
      target: { value: '0' },
    });

    expect(await screen.findByText(EMPTY_FILES_TEXT)).toBeTruthy();
    expect(screen.queryByText('LATEST-IDB')).toBeNull();
  });

  it('hides the run files behind a spinner when an older round has no snapshot anywhere', async () => {
    idb.files = { 'index.html': 'LATEST-IDB' };
    idb.roundFiles[1] = undefined;
    setResults(
      result({
        evaluationRounds: [
          round(1),
          round(2, { files: { 'index.html': 'ROUND-2-INLINE' } }),
        ],
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Files');
    await screen.findByText('LATEST-IDB');

    fireEvent.change(panel().querySelector('select') as HTMLSelectElement, {
      target: { value: '0' },
    });

    await waitFor(() => expect(idb.loadRoundFiles).toHaveBeenCalledWith(RESULT_ID, 1));

    // The stored files exist and the load has settled, yet the panel keeps
    // spinning and says nothing.
    expect(panel().querySelectorAll('svg.animate-spin')).toHaveLength(1);
    expect(screen.queryByText(EMPTY_FILES_TEXT)).toBeNull();
    expect(
      screen.queryByText('Not written yet — watch the Monitor stream for updates.'),
    ).toBeNull();
    expect(screen.queryByText('LATEST-IDB')).toBeNull();

    switchTab('Design');
    // The copy written for exactly this state is unreachable: the same guard
    // suppresses the single-file/preview fallbacks it lives in.
    expect(
      screen.queryByText('No file snapshot for this round (re-run agentic to capture).'),
    ).toBeNull();
    expect(screen.queryByText(EMPTY_DESIGN_TEXT)).toBeNull();
    expect(preview.calls).toBe(0);
  });
});

// ── Design tab ─────────────────────────────────────────────────────────

describe('VariantRunInspector — design preview', () => {
  it('renders the bundled artifact frame with the variant title', async () => {
    idb.files = { 'index.html': '<html>multi</html>', 'styles.css': 'body{}' };
    setResults(result());
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Design');

    const frame = await screen.findByTitle(`Design preview: ${STRATEGY_NAME}`);
    expect(frame.getAttribute('srcdoc')).toContain('bundled fallback');
    expect(screen.getAllByTitle(/^Design preview:/)).toHaveLength(1);
    expect(preview.files).toEqual({ 'index.html': '<html>multi</html>', 'styles.css': 'body{}' });
  });

  it('renders a single-file preview from stored code without the artifact frame', async () => {
    idb.code = '<html><body><h1>Single file</h1></body></html>';
    idb.files = undefined;
    setResults(result());
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Design');

    const frame = await screen.findByTitle(`Design preview: ${STRATEGY_NAME}`);
    expect(frame.getAttribute('srcdoc')).toBe('<html><body><h1>Single file</h1></body></html>');
    expect(preview.calls).toBe(0);
  });

  it('prefers liveCode while generating and falls back to stored code', async () => {
    idb.code = '<html><body>STORED</body></html>';
    setResults(result({ status: GENERATION_STATUS.GENERATING, liveCode: '<html>LIVE-CODE</html>' }));
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Design');
    const frame = await screen.findByTitle(`Design preview: ${STRATEGY_NAME}`);
    expect(frame.getAttribute('srcdoc')).toBe('<html>LIVE-CODE</html>');

    act(() => {
      setResults(result({ status: GENERATION_STATUS.GENERATING }));
    });

    await waitFor(() =>
      expect(
        screen.getByTitle(`Design preview: ${STRATEGY_NAME}`).getAttribute('srcdoc'),
      ).toBe('<html><body>STORED</body></html>'),
    );
  });

  it('titles the preview with the fallback name when the strategy is unknown', async () => {
    idb.code = '<html><body>unknown strategy</body></html>';
    setResults(result({ strategyId: 'vs-unknown' }));
    openRunPanel(previewNode(PREVIEW_ID, { strategyId: 'vs-unknown' }));
    render(<VariantRunInspector />);

    switchTab('Design');

    expect(await screen.findByTitle('Design preview: Preview')).toBeTruthy();
  });
});

// ── Monitor tab ────────────────────────────────────────────────────────

describe('VariantRunInspector — monitor tab', () => {
  it('shows the harness stripe and planning state only while generating', async () => {
    setResults(
      result({
        status: GENERATION_STATUS.GENERATING,
        agenticPhase: 'evaluating',
        evaluationStatus: 'Evaluators running',
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    // Both the stripe subtitle and the generating footer's primary line carry
    // the live evaluation status.
    expect(screen.getAllByText('Evaluators running')).toHaveLength(2);
    expect(screen.getByText('Running evaluators')).toBeTruthy();
    expect(screen.getByText('Planning…')).toBeTruthy();

    act(() => {
      setResults(result({ status: GENERATION_STATUS.COMPLETE }));
    });

    expect(screen.queryByText('Running evaluators')).toBeNull();
    expect(screen.queryByText('Evaluators running')).toBeNull();
    expect(screen.getByText('No tasks.')).toBeTruthy();
  });

  it('lists live todos instead of the placeholder', () => {
    setResults(
      result({
        status: GENERATION_STATUS.GENERATING,
        liveTodos: [
          { id: 't1', task: 'Sketch the layout', status: 'in_progress' },
          { id: 't2', task: 'Write the copy', status: 'pending' },
        ],
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    // Scope to the Tasks section: the generating footer echoes the current todo.
    const tasksSection = screen.getByText('Tasks').parentElement?.parentElement as HTMLElement;
    expect(within(tasksSection).getByText('Sketch the layout')).toBeTruthy();
    expect(within(tasksSection).getByText('Write the copy')).toBeTruthy();
    expect(within(tasksSection).getByText('●')).toBeTruthy();
    expect(within(tasksSection).getByText('○')).toBeTruthy();
    // The generating footer echoes the in-progress todo ("Current: …"), so the
    // task text appears twice: once in the list, once in the footer.
    expect(screen.getByText('Current:')).toBeTruthy();
    expect(screen.getAllByText('Sketch the layout')).toHaveLength(2);
    expect(screen.queryByText('Planning…')).toBeNull();
    expect(screen.queryByText('No tasks.')).toBeNull();
  });

  it('renders the live trace labels in the timeline', () => {
    const trace: RunTraceEvent[] = [
      {
        id: 'trace-1',
        at: '2025-01-01T00:00:00.000Z',
        kind: 'model_turn_start',
        label: 'Turn 1 started',
        turnId: 1,
      },
    ];
    setResults(result({ status: GENERATION_STATUS.GENERATING, liveTrace: trace }));
    openRunPanel();
    render(<VariantRunInspector />);

    expect(screen.getByText('Turn 1 started')).toBeTruthy();
    expect(screen.getByText('model_turn_start')).toBeTruthy();
  });
});

// ── Evaluation tab ─────────────────────────────────────────────────────

describe('VariantRunInspector — evaluation tab', () => {
  it('lists every round, flags the latest, and shows scores and fixes', async () => {
    setResults(
      result({
        evaluationRounds: [
          round(1, {
            aggregate: aggregate({
              overallScore: 6.5,
              shouldRevise: true,
              prioritizedFixes: ['Fix the nav contrast'],
            }),
          }),
          round(2, {
            aggregate: aggregate({
              overallScore: 8.5,
              normalizedScores: { 'Visual craft': 9.5 },
            }),
          }),
        ],
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Evaluation');

    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText('Round 1')).toBeTruthy();
    expect(within(cards[1]!).getByText('· latest').parentElement?.textContent).toBe(
      'Round 2· latest',
    );
    expect(screen.getByText('Revise suggested')).toBeTruthy();
    expect(screen.getByText('Pass')).toBeTruthy();
    expect(screen.getByText('6.5')).toBeTruthy();
    expect(screen.getByText('8.5')).toBeTruthy();
    expect(screen.getByText('Visual craft')).toBeTruthy();
    expect(screen.getByText('9.5')).toBeTruthy();
    expect(screen.getByText('Fix the nav contrast')).toBeTruthy();
  });

  it('falls back to the run-level evaluation summary when there are no rounds', async () => {
    setResults(
      result({
        evaluationRounds: [],
        evaluationSummary: aggregate({ overallScore: 5.5, shouldRevise: true }),
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Evaluation');

    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(1);
    expect(within(cards[0]!).getByText('Evaluation')).toBeTruthy();
    expect(screen.getByText('Revise suggested')).toBeTruthy();
    expect(screen.getByText('5.5')).toBeTruthy();
    expect(screen.queryByText('· latest')).toBeNull();
    expect(screen.queryByText(EMPTY_EVAL_TEXT)).toBeNull();
  });

  it('explains that no evaluation data exists, differently while generating', async () => {
    setResults(result({ evaluationRounds: [] }));
    openRunPanel();
    render(<VariantRunInspector />);

    switchTab('Evaluation');
    expect(await screen.findByText(EMPTY_EVAL_TEXT)).toBeTruthy();

    act(() => {
      setResults(result({ evaluationRounds: [], status: GENERATION_STATUS.GENERATING }));
    });

    expect(
      screen.getByText('Evaluation runs after the build phase; completed rounds will stack here.'),
    ).toBeTruthy();
    expect(screen.queryByText(EMPTY_EVAL_TEXT)).toBeNull();
  });

  it('shows the live evaluator badge on other tabs and hides it on the evaluation tab', async () => {
    setResults(
      result({
        status: GENERATION_STATUS.GENERATING,
        agenticPhase: 'evaluating',
        liveEvalWorkers: {
          design: worker('design', { 'Visual craft': 8 }),
          strategy: worker('strategy', { Clarity: 6 }),
        },
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    expect(screen.getByText('(2/4)')).toBeTruthy();

    switchTab('Evaluation');

    expect(await screen.findByText('2/4 rubrics')).toBeTruthy();
    expect(screen.queryByText('(2/4)')).toBeNull();
    expect(screen.getByText('Implementation')).toBeTruthy();
    expect(screen.getByText('Browser')).toBeTruthy();
    expect(screen.getAllByText('Done')).toHaveLength(2);
  });

  it('hides the live evaluator badge and progress card once the run is not generating', async () => {
    setResults(
      result({
        status: GENERATION_STATUS.COMPLETE,
        liveEvalWorkers: {
          design: worker('design', { 'Visual craft': 8 }),
          strategy: worker('strategy', { Clarity: 6 }),
        },
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    expect(screen.queryByText('(2/4)')).toBeNull();

    switchTab('Evaluation');

    expect(await screen.findByText(EMPTY_EVAL_TEXT)).toBeTruthy();
    expect(screen.queryByText('2/4 rubrics')).toBeNull();
  });

  it("surfaces a degraded evaluator worker's failure detail", async () => {
    setResults(
      result({
        status: GENERATION_STATUS.GENERATING,
        agenticPhase: 'evaluating',
        liveEvalWorkers: {
          browser: {
            rubric: 'browser',
            scores: {},
            findings: [
              { severity: 'high', summary: 'Browser worker crashed', detail: 'Playwright crashed on launch' },
            ],
            hardFails: [{ code: 'evaluator_worker_error', message: 'boom' }],
          },
        },
      }),
    );
    openRunPanel();
    render(<VariantRunInspector />);

    expect(screen.getByText('(1/4)')).toBeTruthy();

    switchTab('Evaluation');

    expect(await screen.findByText('Worker failed')).toBeTruthy();
    expect(screen.getByText('Playwright crashed on launch')).toBeTruthy();
  });
});

// ── Known defect ───────────────────────────────────────────────────────

/** Error boundary: React reports an uncaught render error outside the test's control. */
class Boundary extends React.Component<
  { onError: (error: Error) => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? <p>run panel crashed</p> : this.props.children;
  }
}

describe('VariantRunInspector — malformed round', () => {
  it('degrades a round with no aggregate instead of crashing the panel', () => {
    // A round whose `aggregate` is missing is not a shape the persisted store
    // accepts, but `evaluationRounds` reaches the generation store from live SSE
    // events without write-time validation. Reading `round.aggregate.shouldRevise`
    // used to throw and unmount the whole panel; the card must name what is
    // missing and leave the rest of the tab working.
    const onError = vi.fn();
    setResults(
      result({ evaluationRounds: [{ round: 1 } as unknown as EvaluationRoundSnapshot] }),
    );
    openRunPanel();

    render(
      <Boundary onError={onError}>
        <VariantRunInspector />
      </Boundary>,
    );

    expect(screen.getByRole('complementary', { name: 'Preview run panel' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Evaluation/ }));

    expect(screen.queryByText('run panel crashed')).toBeNull();
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByRole('complementary', { name: 'Preview run panel' })).toBeTruthy();
    expect(screen.getByText('Round 1')).toBeTruthy();
    expect(screen.getByText('No evaluation data for this round')).toBeTruthy();
  });

  it('renders a well-formed round normally, with its score', () => {
    // Control for the test above: the fallback must not swallow healthy rounds.
    const onError = vi.fn();
    setResults(
      result({
        evaluationRounds: [
          {
            round: 1,
            aggregate: {
              overallScore: 4,
              normalizedScores: {},
              hardFails: [],
              prioritizedFixes: [],
              shouldRevise: false,
              revisionBrief: '',
            },
          } as unknown as EvaluationRoundSnapshot,
        ],
      }),
    );
    openRunPanel();

    render(
      <Boundary onError={onError}>
        <VariantRunInspector />
      </Boundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Evaluation/ }));

    expect(onError).not.toHaveBeenCalled();
    expect(screen.queryByText('No evaluation data for this round')).toBeNull();
    expect(screen.getByText('Pass')).toBeTruthy();
    expect(screen.getByText('4.0')).toBeTruthy();
  });
});
