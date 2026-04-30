import type { StateCreator } from 'zustand';
import type { CanvasNodeType } from '../../types/workspace-graph';
import { generateId } from '../../lib/utils';
import { columnX, computeAutoLayout, reconcileEphemeralGhostNodes, snap } from '../../lib/canvas-layout';
import { buildEdgeId, EDGE_TYPES, EDGE_STATUS, NODE_TYPES } from '../../constants/canvas';
import { PREREQUISITE_DEFAULTS } from '../../lib/constants';
import { DEFAULT_DESIGN_SYSTEM_SOURCE_MODE } from '../../types/design-system-mode';
import { hydrateDomainFromCanvasGraph } from '../../workspace/hydrate-domain-from-canvas-graph';
import type { CanvasStore } from './canvas-store-types';

function ensureRequiredDesignSystem(state: Pick<CanvasStore, 'nodes' | 'edges' | 'colGap'>) {
  const nodesWithoutGhosts = reconcileEphemeralGhostNodes(state.nodes);
  const designSystem = nodesWithoutGhosts.find((node) => node.type === NODE_TYPES.DESIGN_SYSTEM);
  if (designSystem) {
    return { nodes: nodesWithoutGhosts, edges: state.edges };
  }

  const col = columnX(state.colGap);
  const designSystemId = `designSystem-${generateId()}`;
  const designSystemNode = {
    id: designSystemId,
    type: NODE_TYPES.DESIGN_SYSTEM,
    position: snap({ x: col.inputs, y: 1180 }),
    data: { sourceMode: DEFAULT_DESIGN_SYSTEM_SOURCE_MODE },
  };
  const incubatorEdges = nodesWithoutGhosts
    .filter((node) => node.type === NODE_TYPES.INCUBATOR)
    .map((node) => ({
      id: buildEdgeId(designSystemId, node.id),
      source: designSystemId,
      target: node.id,
      type: EDGE_TYPES.DATA_FLOW,
      data: { status: EDGE_STATUS.IDLE },
    }));

  return {
    nodes: [...nodesWithoutGhosts, designSystemNode],
    edges: [...state.edges, ...incubatorEdges],
  };
}

export const createLayoutSlice: StateCreator<
  CanvasStore,
  [],
  [],
  Pick<CanvasStore, 'applyAutoLayout' | 'initializeCanvas' | 'resetCanvas' | 'reset'>
> = (set, get) => ({
  applyAutoLayout: () => {
    const { nodes, edges, colGap } = get();
    if (nodes.length === 0) return;
    set({ nodes: computeAutoLayout(nodes, edges, colGap) });
  },

  initializeCanvas: () => {
    const state = get();
    if (state.nodes.length > 0) {
      const ensured = ensureRequiredDesignSystem(state);
      set(ensured);
      hydrateDomainFromCanvasGraph({
        nodes: get().nodes as { id: string; type: CanvasNodeType; data: Record<string, unknown> }[],
        edges: get().edges,
      });
      get().applyAutoLayout();
      return;
    }

    const col = columnX(state.colGap);
    const briefId = `designBrief-${generateId()}`;
    const modelId = `model-${generateId()}`;
    const designSystemId = `designSystem-${generateId()}`;
    const incubatorId = `incubator-${generateId()}`;

    const coreNodes = [
      {
        id: briefId,
        type: 'designBrief' as const,
        position: snap({ x: col.inputs, y: 300 }),
        data: {},
      },
      {
        id: modelId,
        type: 'model' as const,
        position: snap({ x: col.incubator, y: 100 }),
        data: { ...PREREQUISITE_DEFAULTS['model'] },
      },
      {
        id: designSystemId,
        type: 'designSystem' as const,
        position: snap({ x: col.inputs, y: 1180 }),
        data: { sourceMode: DEFAULT_DESIGN_SYSTEM_SOURCE_MODE },
      },
      {
        id: incubatorId,
        type: 'incubator' as const,
        position: snap({ x: col.incubator, y: 560 }),
        data: {},
      },
    ];
    set({
      nodes: reconcileEphemeralGhostNodes(coreNodes),
      edges: [
        {
          id: buildEdgeId(briefId, incubatorId),
          source: briefId,
          target: incubatorId,
          type: EDGE_TYPES.DATA_FLOW,
          data: { status: EDGE_STATUS.IDLE },
        },
        {
          id: buildEdgeId(modelId, incubatorId),
          source: modelId,
          target: incubatorId,
          type: EDGE_TYPES.DATA_FLOW,
          data: { status: EDGE_STATUS.IDLE },
        },
        {
          id: buildEdgeId(designSystemId, incubatorId),
          source: designSystemId,
          target: incubatorId,
          type: EDGE_TYPES.DATA_FLOW,
          data: { status: EDGE_STATUS.IDLE },
        },
      ],
      pendingFitViewAfterTemplate: true,
    });
    hydrateDomainFromCanvasGraph({
      nodes: get().nodes as { id: string; type: CanvasNodeType; data: Record<string, unknown> }[],
      edges: get().edges,
    });
    get().applyAutoLayout();
  },

  resetCanvas: () => {
    set({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 0.85 },
      expandedPreviewId: null,
      runInspectorPreviewNodeId: null,
      lineageNodeIds: new Set(),
      lineageEdgeIds: new Set(),
      pendingFitViewAfterTemplate: false,
      pendingFocusNodeId: null,
    });
    get().initializeCanvas();
  },

  reset: () =>
    set({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 0.85 },
      expandedPreviewId: null,
      runInspectorPreviewNodeId: null,
      lineageNodeIds: new Set(),
      lineageEdgeIds: new Set(),
      pendingFitViewAfterTemplate: false,
      pendingFocusNodeId: null,
    }),
});
