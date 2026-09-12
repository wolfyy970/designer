/** @vitest-environment jsdom */
/**
 * `CanvasWorkspace` is the canvas composition root — the last large untested
 * module (152 statements, 0%). It owns the React Flow mount, the viewport and
 * selection wiring, and the z-index promotion that lifts a preview card above
 * the graph while its hypothesis is generating.
 *
 * React Flow itself is stubbed to a prop capture so the props this component
 * computes can be asserted directly. Child panels and the canvas hooks are
 * stubbed (they are separate units with their own suites); the canvas and
 * generation stores are real, so the node/edge derivation under test is the
 * real one.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

/** Props the component handed to ReactFlow on the last render. */
const rf = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: Record<string, unknown>) => {
    rf.props = props;
    return React.createElement('div', { 'data-testid': 'react-flow' });
  },
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  MiniMap: () => React.createElement('div', { 'data-testid': 'minimap' }),
  Background: () => null,
  BackgroundVariant: { Dots: 'dots' },
  useNodesInitialized: () => true,
  useReactFlow: () => ({
    setCenter: vi.fn(),
    getNodes: () => [],
    getEdges: () => [],
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    fitView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    setViewport: vi.fn(),
  }),
  useStoreApi: () => ({ getState: () => ({ width: 1200, height: 800 }) }),
}));

vi.mock('@xyflow/react/dist/base.css', () => ({}));

vi.mock('@ds/lib/use-theme', () => ({ useTheme: () => 'dark' }));

// Child panels: separate units, each with its own coverage.
vi.mock('../CanvasHeader', () => ({ default: () => null }));
vi.mock('../OpenRouterBudgetBanner', () => ({ default: () => null }));
vi.mock('../CanvasToolbar', () => ({ default: () => null }));
vi.mock('../VariantPreviewOverlay', () => ({ default: () => null }));
vi.mock('../VariantRunInspector', () => ({ default: () => null }));
vi.mock('../OptionalInputsTip', () => ({ default: () => null }));

// Canvas hooks: sidecar behaviors, stubbed so the render stays deterministic.
vi.mock('../hooks/useCanvasOrchestrator', () => ({ useCanvasOrchestrator: () => {} }));
vi.mock('../hooks/useNodeDeletion', () => ({ useNodeDeletion: () => {} }));
vi.mock('../hooks/useFeedbackLoopConnection', () => ({
  useFeedbackLoopConnection: () => ({ handleConnect: vi.fn() }),
}));
vi.mock('../hooks/useCanvasZoomInput', () => ({
  useCanvasZoomInput: () => ({
    canvasZoomRootRef: { current: null },
    markPointerOverCanvas: vi.fn(),
    markPointerOutsideCanvas: vi.fn(),
  }),
}));
vi.mock('../../../hooks/useSyncEvaluatorDefaultsFromConfig', () => ({
  useSyncEvaluatorDefaultsFromConfig: () => {},
}));

const appConfig = vi.hoisted(() => ({ withLockdown: false }));
vi.mock('../../../hooks/useAppConfig', () => ({
  useAppConfig: () => ({
    data: { lockdown: appConfig.withLockdown, autoImprove: false, maxConcurrentRuns: 5 },
  }),
}));

import CanvasWorkspace from '../CanvasWorkspace';
import { useCanvasStore } from '../../../stores/canvas-store';
import { useGenerationStore } from '../../../stores/generation-store';
import { GENERATION_STATUS } from '../../../constants/generation';
import { PREVIEW_NODE_GENERATING_Z_INDEX } from '../../../constants/canvas';
import type { WorkspaceNode } from '../../../types/workspace-graph';
import type { GenerationResult } from '../../../types/provider';

const HYP_ID = 'hyp-1';
const PREVIEW_ID = 'preview-1';
const STRATEGY_ID = 'vs-1';

const hypothesisNode: WorkspaceNode = {
  id: HYP_ID,
  type: 'hypothesis',
  position: { x: 0, y: 0 },
  data: { refId: STRATEGY_ID },
} as WorkspaceNode;

/** A preview node whose data carries the given strategy/ref ids. */
function previewNode(data: Record<string, unknown> = { strategyId: STRATEGY_ID }): WorkspaceNode {
  return {
    id: PREVIEW_ID,
    type: 'preview',
    position: { x: 400, y: 0 },
    data,
  } as WorkspaceNode;
}

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

/** The nodes the component passed down to ReactFlow. */
function renderedNodes(): Array<Record<string, unknown>> {
  return (rf.props?.nodes ?? []) as Array<Record<string, unknown>>;
}

function nodeById(id: string) {
  return renderedNodes().find((n) => n.id === id);
}

/** Re-render so the captured props reflect current store state. */
function renderWorkspace() {
  return render(<CanvasWorkspace />);
}

beforeEach(() => {
  rf.props = null;
  appConfig.withLockdown = false;
  useCanvasStore.setState({
    nodes: [hypothesisNode, previewNode()],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    showMiniMap: true,
    runInspectorPreviewNodeId: null,
    pendingFitViewAfterTemplate: false,
    pendingFocusNodeId: null,
    pendingFitNodeIds: null,
  } as never);
  useGenerationStore.setState({ results: [] } as never);
});

afterEach(() => cleanup());

describe('CanvasWorkspace — React Flow mount', () => {
  it('mounts React Flow with the canvas nodes and edges', () => {
    renderWorkspace();

    expect(rf.props).not.toBeNull();
    // The seeded hypothesis + preview survive initializeCanvas, which also
    // materializes the starter scaffolding (three optional-input ghost cards
    // and a design-system node) around them.
    const ids = renderedNodes().map((n) => n.id);
    expect(ids).toContain(HYP_ID);
    expect(ids).toContain(PREVIEW_ID);
    expect(ids.some((id) => id.startsWith('ghost-input-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('designSystem-'))).toBe(true);
  });

  it('disables scroll and pinch zoom here, because the canvas owns zoom input', () => {
    renderWorkspace();

    // useCanvasZoomInput handles pinch/scroll; letting React Flow also handle it
    // would double-apply zoom.
    expect(rf.props?.zoomOnScroll).toBe(false);
    expect(rf.props?.zoomOnPinch).toBe(false);
    // Delete is handled by the keyboard-delete path, not React Flow.
    expect(rf.props?.deleteKeyCode).toBeNull();
  });

  it('renders the minimap only while showMiniMap is on', () => {
    const { unmount } = renderWorkspace();
    expect(rf.props?.children).toBeTruthy();
    unmount();

    useCanvasStore.setState({ showMiniMap: false } as never);
    renderWorkspace();
    // showMiniMap gates the MiniMap element inside the ReactFlow children.
    const children = React.Children.toArray(rf.props?.children as React.ReactNode);
    const hasMiniMap = children.some(
      (c) => React.isValidElement(c) && (c.type as { name?: string })?.name === 'MiniMap',
    );
    expect(hasMiniMap).toBe(false);
  });
});

describe('CanvasWorkspace — preview z-index promotion', () => {
  it('leaves a preview alone when nothing is generating', () => {
    useGenerationStore.setState({ results: [result()] } as never);
    renderWorkspace();

    expect(nodeById(PREVIEW_ID)?.zIndex).toBeUndefined();
  });

  it('promotes a preview while its strategy is generating', () => {
    useGenerationStore.setState({
      results: [result({ status: GENERATION_STATUS.GENERATING })],
    } as never);
    renderWorkspace();

    expect(nodeById(PREVIEW_ID)?.zIndex).toBe(PREVIEW_NODE_GENERATING_Z_INDEX);
  });

  it('promotes a pinned preview whose refId matches a generating result', () => {
    // Archived previews carry refId (the pinned result id) instead of strategyId.
    useCanvasStore.setState({
      nodes: [hypothesisNode, previewNode({ refId: 'result-1' })],
      edges: [],
    } as never);
    useGenerationStore.setState({
      results: [result({ id: 'result-1', status: GENERATION_STATUS.GENERATING })],
    } as never);
    renderWorkspace();

    expect(nodeById(PREVIEW_ID)?.zIndex).toBe(PREVIEW_NODE_GENERATING_Z_INDEX);
  });

  it('does not promote a preview for an unrelated generating strategy', () => {
    useCanvasStore.setState({
      nodes: [hypothesisNode, previewNode({ strategyId: 'vs-other' })],
      edges: [],
    } as never);
    useGenerationStore.setState({
      results: [result({ status: GENERATION_STATUS.GENERATING })],
    } as never);
    renderWorkspace();

    expect(nodeById(PREVIEW_ID)?.zIndex).toBeUndefined();
  });

  it('never promotes non-preview nodes', () => {
    useGenerationStore.setState({
      results: [result({ status: GENERATION_STATUS.GENERATING })],
    } as never);
    renderWorkspace();

    expect(nodeById(HYP_ID)?.zIndex).toBeUndefined();
  });
});

describe('CanvasWorkspace — viewport and selection wiring', () => {
  it('persists viewport changes into the canvas store', () => {
    renderWorkspace();
    const onViewportChange = rf.props?.onViewportChange as (vp: {
      x: number;
      y: number;
      zoom: number;
    }) => void;

    onViewportChange({ x: 12, y: 34, zoom: 1.5 });

    expect(useCanvasStore.getState().viewport).toEqual({ x: 12, y: 34, zoom: 1.5 });
  });

  it('computes lineage for a single-node selection', () => {
    // Lineage is a connected-component walk, so the two nodes need an edge.
    useCanvasStore.setState({
      nodes: [hypothesisNode, previewNode()],
      edges: [{ id: 'e1', source: HYP_ID, target: PREVIEW_ID }],
    } as never);
    renderWorkspace();
    const onSelectionChange = rf.props?.onSelectionChange as (p: {
      nodes: Array<{ id: string }>;
    }) => void;

    onSelectionChange({ nodes: [{ id: HYP_ID }] });

    const lineage = useCanvasStore.getState().lineageNodeIds as Set<string> | null;
    expect(lineage).not.toBeNull();
    expect([...(lineage ?? [])].sort()).toEqual([HYP_ID, PREVIEW_ID]);
  });

  it('clears lineage when the selection is empty or multi-node', () => {
    renderWorkspace();
    const onSelectionChange = rf.props?.onSelectionChange as (p: {
      nodes: Array<{ id: string }>;
    }) => void;

    onSelectionChange({ nodes: [{ id: PREVIEW_ID }, { id: HYP_ID }] });

    const lineage = useCanvasStore.getState().lineageNodeIds;
    expect(!lineage || lineage.size === 0).toBe(true);
  });

  it('records the connecting node type on drag start and clears it on end', () => {
    renderWorkspace();
    const onConnectStart = rf.props?.onConnectStart as (
      e: unknown,
      p: { nodeId: string | null; handleType: string | null },
    ) => void;
    const onConnectEnd = rf.props?.onConnectEnd as () => void;

    onConnectStart(null, { nodeId: HYP_ID, handleType: 'source' });
    expect(useCanvasStore.getState().connectingFrom).toMatchObject({
      nodeType: 'hypothesis',
      handleType: 'source',
    });

    onConnectEnd();
    expect(useCanvasStore.getState().connectingFrom).toBeNull();
  });

  it('ignores a connect start with no node or handle', () => {
    renderWorkspace();
    const onConnectStart = rf.props?.onConnectStart as (
      e: unknown,
      p: { nodeId: string | null; handleType: string | null },
    ) => void;

    onConnectStart(null, { nodeId: null, handleType: null });

    expect(useCanvasStore.getState().connectingFrom).toBeNull();
  });

  it('ignores a connect start for a node id that is not on the canvas', () => {
    // Guards the store lookup: a stale/hydrating id must not write a glow state
    // with an undefined nodeType.
    renderWorkspace();
    const onConnectStart = rf.props?.onConnectStart as (
      e: unknown,
      p: { nodeId: string | null; handleType: string | null },
    ) => void;

    onConnectStart(null, { nodeId: 'does-not-exist', handleType: 'source' });

    expect(useCanvasStore.getState().connectingFrom).toBeNull();
  });

  it('ignores a connect start from a node with no type', () => {
    useCanvasStore.setState({
      nodes: [{ id: 'typeless', position: { x: 0, y: 0 }, data: {} }] as never,
      edges: [],
    } as never);
    renderWorkspace();
    const onConnectStart = rf.props?.onConnectStart as (
      e: unknown,
      p: { nodeId: string | null; handleType: string | null },
    ) => void;

    onConnectStart(null, { nodeId: 'typeless', handleType: 'target' });

    expect(useCanvasStore.getState().connectingFrom).toBeNull();
  });
});

describe('CanvasWorkspace — minimap node colors', () => {
  it('maps each node category to its own token', async () => {
    renderWorkspace();
    const nodeColor = rf.props?.children;
    // miniMapNodeColor is passed to MiniMap, not ReactFlow; reach it through the
    // MiniMap child element's props.
    const children = React.Children.toArray(nodeColor as React.ReactNode);
    const miniMap = children.find(
      (c) => React.isValidElement(c) && (c.type as { name?: string })?.name === 'MiniMap',
    ) as React.ReactElement<{ nodeColor: (n: { type?: string }) => string }> | undefined;

    expect(miniMap).toBeTruthy();
    const color = miniMap!.props.nodeColor;

    // Inputs / ghosts / processing / output each get a distinct mapping.
    expect(color({ type: 'designBrief' })).toBe('var(--color-fg-muted)');
    expect(color({ type: 'inputGhost' })).toBe('var(--color-fg-faint)');
    expect(color({ type: 'incubator' })).toBe('var(--color-accent)');
    expect(color({ type: 'designSystem' })).toBe('var(--color-accent)');
    expect(color({ type: 'hypothesis' })).toBe('var(--color-info)');
    expect(color({ type: 'preview' })).toBe('var(--color-info)');
    expect(color({ type: 'somethingElse' })).toBe('var(--color-border)');
    expect(color({})).toBe('var(--color-border)');
  });
});
