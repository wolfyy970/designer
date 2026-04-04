import type { StateCreator } from 'zustand';
import type { CanvasNodeType } from '../../types/workspace-graph';
import { generateId } from '../../lib/utils';
import { columnX, computeAutoLayout, reconcileSectionGhostNodes, snap } from '../../lib/canvas-layout';
import { buildEdgeId, EDGE_TYPES, EDGE_STATUS } from '../../constants/canvas';
import { PREREQUISITE_DEFAULTS } from '../../lib/constants';
import { hydrateDomainFromCanvasGraph } from '../workspace-domain-store';
import type { CanvasStore } from './canvas-store-types';

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
      hydrateDomainFromCanvasGraph({
        nodes: state.nodes as { id: string; type: CanvasNodeType; data: Record<string, unknown> }[],
        edges: state.edges,
      });
      set({
        nodes: reconcileSectionGhostNodes(get().nodes, get().dismissedSectionGhostSlots),
      });
      if (get().autoLayout) get().applyAutoLayout();
      return;
    }

    const col = columnX(state.colGap);
    const briefId = `designBrief-${generateId()}`;
    const modelId = `model-${generateId()}`;
    const compilerId = `compiler-${generateId()}`;

    const coreNodes = [
      {
        id: briefId,
        type: 'designBrief' as const,
        position: snap({ x: col.sections, y: 300 }),
        data: {},
      },
      {
        id: modelId,
        type: 'model' as const,
        position: snap({ x: col.compiler, y: 100 }),
        data: { ...PREREQUISITE_DEFAULTS['model'] },
      },
      {
        id: compilerId,
        type: 'compiler' as const,
        position: snap({ x: col.compiler, y: 400 }),
        data: {},
      },
    ];
    set({
      nodes: reconcileSectionGhostNodes(coreNodes, get().dismissedSectionGhostSlots),
      edges: [
        {
          id: buildEdgeId(briefId, compilerId),
          source: briefId,
          target: compilerId,
          type: EDGE_TYPES.DATA_FLOW,
          data: { status: EDGE_STATUS.IDLE },
        },
        {
          id: buildEdgeId(modelId, compilerId),
          source: modelId,
          target: compilerId,
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
    if (get().autoLayout) get().applyAutoLayout();
  },

  resetCanvas: () => {
    set({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 0.85 },
      expandedVariantId: null,
      runInspectorVariantNodeId: null,
      lineageNodeIds: new Set(),
      lineageEdgeIds: new Set(),
      pendingFitViewAfterTemplate: false,
      dismissedSectionGhostSlots: [],
      sectionGhostToolbarNudge: false,
    });
    get().initializeCanvas();
  },

  reset: () =>
    set({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 0.85 },
      expandedVariantId: null,
      runInspectorVariantNodeId: null,
      lineageNodeIds: new Set(),
      lineageEdgeIds: new Set(),
      pendingFitViewAfterTemplate: false,
      dismissedSectionGhostSlots: [],
      sectionGhostToolbarNudge: false,
    }),
});
