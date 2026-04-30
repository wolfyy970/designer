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
import { INPUT_GHOST_NODE_TYPE } from '../constants/canvas';

export { INPUT_NODE_TYPES } from '../constants/canvas';
export { GRID_SIZE } from '../lib/canvas-layout';
export type { CanvasNodeData, CanvasNodeType } from '../types/workspace-graph';
export { NODE_TYPE_TO_SECTION } from '../types/workspace-graph';
export type { EdgeStatus } from '../constants/canvas';

const initialCanvasState: Pick<
  CanvasStore,
  | 'nodes'
  | 'edges'
  | 'viewport'
  | 'showMiniMap'
  | 'colGap'
  | 'expandedPreviewId'
  | 'runInspectorPreviewNodeId'
  | 'lineageNodeIds'
  | 'lineageEdgeIds'
  | 'previewNodeIdMap'
  | 'connectingFrom'
  | 'pendingFitViewAfterTemplate'
  | 'pendingFocusNodeId'
> = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 0.85 },
  showMiniMap: true,
  colGap: DEFAULT_COL_GAP,
  expandedPreviewId: null,
  runInspectorPreviewNodeId: null,
  lineageNodeIds: new Set<string>(),
  lineageEdgeIds: new Set<string>(),
  previewNodeIdMap: new Map<string, string>(),
  connectingFrom: null,
  pendingFitViewAfterTemplate: false,
  pendingFocusNodeId: null,
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
      version: 30,
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
        nodes: state.nodes.filter((n) => n.type !== INPUT_GHOST_NODE_TYPE),
        edges: state.edges,
        viewport: state.viewport,
        showMiniMap: state.showMiniMap,
        colGap: state.colGap,
      }),
    },
  ),
);
