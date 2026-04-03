/**
 * Zustand canvas projection: React Flow nodes/edges, layout, persistence.
 * Debounced dimension→layout timing lives in `./canvas/dimension-layout-debounce.ts`;
 * hypothesis vertical stack constants in `./canvas/hypothesis-layout-constants.ts`.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_COL_GAP } from '../lib/canvas-layout';
import { STORAGE_KEYS } from '../lib/storage-keys';
import { migrateCanvasState } from './canvas-migrations';
import type { CanvasStore } from './canvas/canvas-store-types';
import { createGraphSlice } from './canvas/canvas-store-graph-slice';
import { createUiSlice } from './canvas/canvas-store-ui-slice';
import { createSyncSlice } from './canvas/canvas-store-sync-slice';
import { createLayoutSlice } from './canvas/canvas-store-layout-slice';

export { GRID_SIZE, SECTION_NODE_TYPES } from '../lib/canvas-layout';
export type { CanvasNodeData, CanvasNodeType } from '../types/workspace-graph';
export { NODE_TYPE_TO_SECTION } from '../types/workspace-graph';
export type { EdgeStatus } from '../constants/canvas';

const initialCanvasState: Pick<
  CanvasStore,
  | 'nodes'
  | 'edges'
  | 'viewport'
  | 'showMiniMap'
  | 'showGrid'
  | 'colGap'
  | 'autoLayout'
  | 'expandedVariantId'
  | 'runInspectorVariantNodeId'
  | 'lineageNodeIds'
  | 'lineageEdgeIds'
  | 'variantNodeIdMap'
  | 'connectingFrom'
  | 'pendingFitViewAfterTemplate'
> = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 0.85 },
  showMiniMap: true,
  showGrid: true,
  colGap: DEFAULT_COL_GAP,
  autoLayout: true,
  expandedVariantId: null,
  runInspectorVariantNodeId: null,
  lineageNodeIds: new Set<string>(),
  lineageEdgeIds: new Set<string>(),
  variantNodeIdMap: new Map<string, string>(),
  connectingFrom: null,
  pendingFitViewAfterTemplate: false,
};

export const useCanvasStore = create<CanvasStore>()(
  persist(
    (set, get, api) => ({
      ...initialCanvasState,
      ...createGraphSlice(set, get, api),
      ...createUiSlice(set, get, api),
      ...createSyncSlice(set, get, api),
      ...createLayoutSlice(set, get, api),
    }),
    {
      name: STORAGE_KEYS.CANVAS,
      version: 15,
      migrate: (persistedState: unknown, version: number) => {
        try {
          if (typeof persistedState === 'string') {
            return migrateCanvasState(JSON.parse(persistedState), version);
          }
          return migrateCanvasState(persistedState, version);
        } catch (e) {
          console.error('Failed to parse persisted canvas state for migration', e);
          return migrateCanvasState({}, version);
        }
      },
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        showMiniMap: state.showMiniMap,
        showGrid: state.showGrid,
        colGap: state.colGap,
        autoLayout: state.autoLayout,
      }),
    },
  ),
);
