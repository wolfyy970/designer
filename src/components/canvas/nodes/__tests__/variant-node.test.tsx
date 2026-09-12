/** @vitest-environment jsdom */
/**
 * `VariantNode` — the preview card (canvas type `preview`, component name kept
 * for history) — had zero coverage despite owning five distinct render states.
 *
 * Real stores are used for generation/incubator/canvas state. The async data
 * hooks (`useResultCode`, `useResultFiles`, `useVersionStack`, the debug-export
 * hook) and `useAppConfig` are stubbed so each render state can be reached
 * synchronously — those are the data boundary, not the logic under test.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

/**
 * `useVariantZoom` observes its container with a ResizeObserver, which jsdom
 * does not implement. A no-op stub is enough: these tests assert render state,
 * not measured size.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

vi.mock('@radix-ui/react-slot', () => ({
  Slot: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

/** Controllable stubs — reassigned per test. */
const stubs = vi.hoisted(() => ({
  code: undefined as string | undefined,
  codeLoading: false,
  files: undefined as Record<string, string> | undefined,
  versionStack: {} as Record<string, unknown>,
  appConfig: { autoImprove: false } as Record<string, unknown>,
}));

vi.mock('../../../../hooks/useResultCode', () => ({
  useResultCode: () => ({ code: stubs.code, isLoading: stubs.codeLoading }),
}));
vi.mock('../../../../hooks/useResultFiles', () => ({
  useResultFiles: () => ({ files: stubs.files }),
}));
vi.mock('../../../../hooks/useVersionStack', () => ({
  useVersionStack: () => stubs.versionStack,
}));
vi.mock('../../../../hooks/useAppConfig', () => ({
  useAppConfig: () => ({ data: stubs.appConfig }),
}));
vi.mock('../useVariantNodeDebugExport', () => ({
  useVariantNodeDebugExport: () => ({
    debugExportOpen: false,
    setDebugExportOpen: vi.fn(),
    debugExportPreviewInput: null,
    handleConfirmDebugExport: vi.fn(),
  }),
}));
vi.mock('../../../../hooks/useCanvasNodePermanentRemove', () => ({
  useCanvasNodePermanentRemove: () => () => {},
}));
vi.mock('../../../../hooks/useNodeRemoval', () => ({
  useNodeRemoval: () => vi.fn(),
}));

import VariantNode from '../VariantNode';
import { PermanentDeleteConfirmProvider } from '../../../../contexts/PermanentDeleteConfirmProvider';
import { useGenerationStore } from '../../../../stores/generation-store';
import { useIncubatorStore } from '../../../../stores/incubator-store';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { GENERATION_STATUS } from '../../../../constants/generation';
import type { GenerationResult } from '../../../../types/provider';

const PREVIEW_ID = 'preview-1';
const STRATEGY_ID = 'vs-1';

const strategy = {
  id: STRATEGY_ID,
  name: 'Instant resume',
  hypothesis: 'h',
  rationale: 'r',
  measurements: 'm',
  dimensionValues: {},
};

/** A completed result carrying the given generations status. */
function result(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    id: 'result-1',
    strategyId: STRATEGY_ID,
    providerId: 'openrouter',
    modelId: 'm',
    status: GENERATION_STATUS.COMPLETE,
    runId: 'run-1',
    runNumber: 1,
    ...overrides,
  } as GenerationResult;
}

function setResults(results: GenerationResult[]) {
  useGenerationStore.setState({ results } as never);
}

function setVersionStack(activeResult: GenerationResult | undefined) {
  stubs.versionStack = {
    results: activeResult ? [activeResult] : [],
    stack: activeResult ? [activeResult] : [],
    activeResult,
    completedStack: activeResult ? [activeResult] : [],
    isActiveBest: false,
    bestCompletedResult: activeResult,
    stackIndex: 0,
    stackTotal: activeResult ? 1 : 0,
    versionKey: activeResult ? `${activeResult.id}:1` : undefined,
    goNewer: vi.fn(),
    goOlder: vi.fn(),
    setSelectedVersion: vi.fn(),
    setUserBest: vi.fn(),
    userBestOverrides: {},
  };
}

function nodeProps(data: Record<string, unknown> = { strategyId: STRATEGY_ID }) {
  return {
    id: PREVIEW_ID,
    data,
    selected: false,
    type: 'preview',
    isConnectable: true,
    zIndex: 0,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as unknown as NodeProps<never>;
}

function renderNode(data?: Record<string, unknown>) {
  return render(
    <PermanentDeleteConfirmProvider>
      <VariantNode {...nodeProps(data)} />
    </PermanentDeleteConfirmProvider>,
  );
}

beforeEach(() => {
  stubs.code = undefined;
  stubs.codeLoading = false;
  stubs.files = undefined;
  stubs.appConfig = { autoImprove: false };
  setVersionStack(undefined);
  useIncubatorStore.setState({
    incubationPlans: { inc: { id: 'inc', dimensions: [], hypotheses: [strategy] } },
  } as never);
  useCanvasStore.setState({ nodes: [], edges: [], previewNodeIdMap: new Map() } as never);
  setResults([]);
});

afterEach(() => cleanup());

describe('VariantNode — render states', () => {
  it('shows the pending state when no result exists yet', () => {
    renderNode();
    // No result and no strategy name resolution path fails → still renders a shell.
    expect(screen.queryByText(/Preview|Instant resume/)).toBeTruthy();
  });

  it('shows the generating state while a run is in flight', () => {
    const generating = result({ status: GENERATION_STATUS.GENERATING });
    setResults([generating]);
    setVersionStack(generating);

    const { container } = renderNode();
    // The generating body is mounted rather than the single/multi file bodies.
    expect(container.textContent ?? '').not.toMatch(/Untitled/);
    expect(screen.queryByText('Instant resume')).toBeTruthy();
  });

  it('shows the error state for a failed result', () => {
    const errored = result({ status: GENERATION_STATUS.ERROR, error: 'upstream exploded' });
    setResults([errored]);
    setVersionStack(errored);

    renderNode();
    expect(screen.getByText(/upstream exploded/)).toBeTruthy();
  });

  it('renders the single-file body when only code is available', () => {
    const done = result();
    setResults([done]);
    setVersionStack(done);
    stubs.code = '<html><body><h1>Single file result</h1></body></html>';

    const { container } = renderNode();
    // Single-file path inlines the code through prepareIframeContent.
    expect(container.innerHTML).toContain('Single file result');
  });

  it('renders the multi-file tabs and lists files in the code tab', () => {
    const done = result();
    setResults([done]);
    setVersionStack(done);
    stubs.files = {
      'index.html': '<html><body>multi</body></html>',
      'styles.css': 'body{}',
      'app.js': 'console.log(1)',
    };

    const { container } = renderNode();

    // Multi-file results get the preview/build/code tab bar.
    expect(screen.getByText('preview')).toBeTruthy();
    expect(screen.getByText('build')).toBeTruthy();

    // The explorer only mounts on the code tab.
    fireEvent.pointerDown(screen.getByText('code'));
    const text = container.textContent ?? '';
    expect(text).toMatch(/index\.html/);
    expect(text).toMatch(/styles\.css/);
    expect(text).toMatch(/app\.js/);
  });

  it('labels the card with the strategy name when one resolves', () => {
    const done = result();
    setResults([done]);
    setVersionStack(done);

    renderNode();
    expect(screen.getByText('Instant resume')).toBeTruthy();
  });

  it('falls back to the legacy refId lookup when no strategyId is on the node', () => {
    const done = result();
    setResults([done]);
    setVersionStack(undefined);
    stubs.code = '<html><body>legacy</body></html>';

    const { container } = renderNode({ refId: done.id });
    // Resolved via data.refId, so the card names it "Preview" (no strategy) and
    // still reaches the single-file body rather than the pending state.
    expect(container.textContent ?? '').toMatch(/Preview/);
    expect(container.innerHTML).not.toContain('No result yet');
  });
});
