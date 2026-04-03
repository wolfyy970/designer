import type { StateCreator } from 'zustand';
import { computeLineage } from '../../lib/canvas-graph';
import { MAX_COL_GAP, MIN_COL_GAP } from '../../lib/canvas-layout';
import type { CanvasStore } from './canvas-store-types';

export const createUiSlice: StateCreator<
  CanvasStore,
  [],
  [],
  Pick<
    CanvasStore,
    | 'setViewport'
    | 'toggleMiniMap'
    | 'toggleGrid'
    | 'setColGap'
    | 'toggleAutoLayout'
    | 'setExpandedVariant'
    | 'setRunInspectorVariant'
    | 'closeRunInspector'
    | 'computeLineage'
    | 'setConnectingFrom'
    | 'setEdgeStatusBySource'
    | 'setEdgeStatusByTarget'
    | 'clearVariantNodeIdMap'
    | 'consumePendingFitView'
  >
> = (set, get) => ({
  consumePendingFitView: () => set({ pendingFitViewAfterTemplate: false }),

  setViewport: (viewport) => set({ viewport }),

  toggleMiniMap: () => set((s) => ({ showMiniMap: !s.showMiniMap })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setColGap: (gap) => {
    const clamped = Math.max(MIN_COL_GAP, Math.min(MAX_COL_GAP, gap));
    set({ colGap: clamped });
    get().applyAutoLayout();
  },
  toggleAutoLayout: () => {
    const next = !get().autoLayout;
    set({ autoLayout: next });
    if (next) get().applyAutoLayout();
  },

  setExpandedVariant: (id) => set({ expandedVariantId: id }),

  setRunInspectorVariant: (variantNodeId: string | null) =>
    set({ runInspectorVariantNodeId: variantNodeId }),

  closeRunInspector: () => set({ runInspectorVariantNodeId: null }),

  computeLineage: (selectedNodeId) => {
    if (!selectedNodeId) {
      if (get().lineageNodeIds.size === 0) return;
      set({ lineageNodeIds: new Set(), lineageEdgeIds: new Set() });
      return;
    }

    const { nodeIds, edgeIds } = computeLineage(get().edges, selectedNodeId);

    if (nodeIds.size <= 1) {
      set({ lineageNodeIds: new Set(), lineageEdgeIds: new Set() });
    } else {
      set({ lineageNodeIds: nodeIds, lineageEdgeIds: edgeIds });
    }
  },

  clearVariantNodeIdMap: () => set({ variantNodeIdMap: new Map() }),
  setConnectingFrom: (from) => set({ connectingFrom: from }),

  setEdgeStatusBySource: (sourceId, status) =>
    set({
      edges: get().edges.map((e) =>
        e.source === sourceId ? { ...e, data: { status } } : e,
      ),
    }),

  setEdgeStatusByTarget: (targetId, status) =>
    set({
      edges: get().edges.map((e) =>
        e.target === targetId ? { ...e, data: { status } } : e,
      ),
    }),
});
