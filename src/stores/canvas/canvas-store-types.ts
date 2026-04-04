import type { GenerationResult } from '../../types/provider';
import type { VariantStrategy } from '../../types/compiler';
import type { Connection } from '../../workspace/reactflow-adapter';
import {
  applyWorkspaceEdgeChanges,
  applyWorkspaceNodeChanges,
} from '../../workspace/reactflow-adapter';
import type {
  CanvasNodeData,
  CanvasNodeType,
  WorkspaceEdge,
  WorkspaceNode,
  WorkspaceViewport,
} from '../../types/workspace-graph';
import type { EdgeStatus } from '../../constants/canvas';
import type { SectionGhostTargetType } from '../../types/canvas-data';
import type { DesignSpec } from '../../types/spec';

/** Full canvas Zustand store shape — slices compose into this in `canvas-store.ts`. */
export interface CanvasStore {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  viewport: WorkspaceViewport;

  showMiniMap: boolean;
  showGrid: boolean;
  colGap: number;
  autoLayout: boolean;
  expandedVariantId: string | null;
  runInspectorVariantNodeId: string | null;
  lineageNodeIds: Set<string>;
  lineageEdgeIds: Set<string>;
  variantNodeIdMap: Map<string, string>;
  connectingFrom: { nodeType: CanvasNodeType; handleType: 'source' | 'target' } | null;
  pendingFitViewAfterTemplate: boolean;
  /** Persisted: optional section ghost slots the user hid (re-add from + menu). */
  dismissedSectionGhostSlots: SectionGhostTargetType[];
  /** Session-only: show tip to use toolbar after hiding a ghost. Omitted from persist partialize. */
  sectionGhostToolbarNudge: boolean;
  consumePendingFitView: () => void;

  onNodesChange: (changes: Parameters<typeof applyWorkspaceNodeChanges>[0]) => void;
  onEdgesChange: (changes: Parameters<typeof applyWorkspaceEdgeChanges>[0]) => void;
  setViewport: (viewport: WorkspaceViewport) => void;

  toggleMiniMap: () => void;
  toggleGrid: () => void;
  setColGap: (gap: number) => void;
  toggleAutoLayout: () => void;

  addNode: (type: CanvasNodeType, position?: { x: number; y: number }) => void;
  /** After loading a spec from the library/import, add optional section nodes that have spec content (avoids bogus ghosts). */
  materializeOptionalSectionNodesFromSpec: (spec: DesignSpec) => void;
  dismissSectionGhostSlot: (targetType: SectionGhostTargetType) => void;
  clearSectionGhostToolbarNudge: () => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  updateNodeData: (nodeId: string, data: Partial<CanvasNodeData>) => void;
  disconnectOutputs: (nodeId: string) => void;
  onConnect: (connection: Connection) => void;
  isValidConnection: (connection: Connection | Pick<WorkspaceEdge, 'source' | 'target'>) => boolean;

  setExpandedVariant: (id: string | null) => void;
  setRunInspectorVariant: (variantNodeId: string | null) => void;
  closeRunInspector: () => void;
  computeLineage: (selectedNodeId: string | null) => void;

  addPlaceholderHypotheses: (compilerNodeId: string, count: number) => string[];
  removePlaceholders: (placeholderIds: string[]) => void;
  initializeCanvas: () => void;
  syncAfterCompile: (newVariants: VariantStrategy[], compilerNodeId: string) => void;
  syncAfterGenerate: (results: GenerationResult[], hypothesisNodeId: string) => void;
  forkHypothesisVariants: (hypothesisNodeId: string) => void;
  clearVariantNodeIdMap: () => void;
  setConnectingFrom: (from: CanvasStore['connectingFrom']) => void;
  setEdgeStatusBySource: (sourceId: string, status: EdgeStatus) => void;
  setEdgeStatusByTarget: (targetId: string, status: EdgeStatus) => void;

  applyAutoLayout: () => void;
  resetCanvas: () => void;
  reset: () => void;
}
