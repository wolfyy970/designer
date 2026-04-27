import type { StateCreator } from 'zustand';
import type { DesignSpec } from '../../types/spec';
import {
  type CanvasNodeType,
  type WorkspaceEdge,
  type WorkspaceNode,
} from '../../types/workspace-graph';
import {
  applyWorkspaceEdgeChanges,
  applyWorkspaceNodeChanges,
} from '../../workspace/reactflow-adapter';
import { generateId } from '../../lib/utils';
import {
  columnX,
  computeAdjacentPosition,
  computeDefaultPosition,
  reconcileEphemeralGhostNodes,
  isEphemeralInputGhostId,
  snap,
} from '../../lib/canvas-layout';
import { NODE_TYPES, INPUT_NODE_TYPES, buildEdgeId, EDGE_TYPES, EDGE_STATUS } from '../../constants/canvas';
import {
  isValidConnection as checkValidConnection,
  buildAutoConnectEdges,
  buildModelEdgeForNode,
  findMissingPrerequisite,
} from '../../lib/canvas-connections';
import { getHypothesisRefId } from '../../lib/hypothesis-node-utils';
import { PREREQUISITE_DEFAULTS } from '../../lib/constants';
import {
  syncDomainForNewEdge,
  syncDomainForRemovedEdge,
  syncDomainForRemovedNode,
} from '../../workspace/domain-commands';
import {
  ensureHypothesisStrategyBinding,
  hydrateDomainAfterSpecMaterialize,
  removeCompilerPlanForNode,
  removeCompilerStrategyByRefId,
  resetSpecSectionForRemovedNode,
  syncNodeDataToWorkspaceDomain,
} from '../../workspace/canvas-orchestration';
import {
  scheduleDebouncedAutoLayout,
  shouldScheduleAutoLayoutOnDimensionChange,
} from '../canvas/dimension-layout-debounce';
import { optionalInputSlotsWithSpecMaterial } from '../../lib/spec-materialize-sections';
import type { CanvasStore } from './canvas-store-types';

const REMOVE_PROTECTED_NODE_TYPES = new Set<string>([
  NODE_TYPES.DESIGN_BRIEF,
  NODE_TYPES.MODEL,
  NODE_TYPES.INCUBATOR,
  'inputGhost',
]);

function syncRemovedEdges(
  removed: readonly WorkspaceEdge[],
  nodes: readonly WorkspaceNode[],
): void {
  for (const edge of removed) {
    syncDomainForRemovedEdge(edge, nodes as WorkspaceNode[]);
  }
}

function removeEdgesAndSync(
  state: Pick<CanvasStore, 'edges' | 'nodes'>,
  shouldRemove: (edge: WorkspaceEdge) => boolean,
): WorkspaceEdge[] {
  const removed = state.edges.filter(shouldRemove);
  if (removed.length === 0) return state.edges;
  syncRemovedEdges(removed, state.nodes);
  const removedIds = new Set(removed.map((edge) => edge.id));
  return state.edges.filter((edge) => !removedIds.has(edge.id));
}

export const createGraphSlice: StateCreator<
  CanvasStore,
  [],
  [],
  Pick<
    CanvasStore,
    | 'onNodesChange'
    | 'onEdgesChange'
    | 'isValidConnection'
    | 'onConnect'
    | 'addNode'
    | 'materializeOptionalInputNodesFromSpec'
    | 'removeNode'
    | 'removeEdge'
    | 'updateNodeData'
    | 'disconnectOutputs'
  >
> = (set, get) => ({
  onNodesChange: (changes) => {
    const filtered = changes.filter((ch) => {
      if (ch.type !== 'remove') return true;
      const id = 'id' in ch ? (ch.id as string) : '';
      if (isEphemeralInputGhostId(id)) return false;
      const node = get().nodes.find((n) => n.id === id);
      return !node || !REMOVE_PROTECTED_NODE_TYPES.has(node.type);
    });
    set({ nodes: applyWorkspaceNodeChanges(filtered, get().nodes) });
    if (shouldScheduleAutoLayoutOnDimensionChange(filtered)) {
      scheduleDebouncedAutoLayout(get);
    }
  },

  onEdgesChange: (changes) => {
    const prev = get().edges;
    const next = applyWorkspaceEdgeChanges(changes, prev);
    const nextIds = new Set(next.map((e) => e.id));
    const removed = prev.filter((e) => !nextIds.has(e.id));
    syncRemovedEdges(removed, get().nodes);
    set({ edges: next });
  },

  isValidConnection: (connection) => {
    const { nodes } = get();
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;
    if (sourceNode.type === 'inputGhost' || targetNode.type === 'inputGhost') {
      return false;
    }
    return checkValidConnection(sourceNode.type ?? '', targetNode.type ?? '');
  },

  onConnect: (connection) => {
    if (!get().isValidConnection(connection)) return;
    const nodes = get().nodes;
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return;

    let edges = [...get().edges];

    if (sourceNode.type === NODE_TYPES.MODEL && targetNode.type === NODE_TYPES.HYPOTHESIS) {
      const removed = edges.filter((e) => {
        if (e.target !== connection.target) return false;
        return nodes.find((n) => n.id === e.source)?.type === NODE_TYPES.MODEL;
      });
      syncRemovedEdges(removed, nodes);
      edges = edges.filter((e) => !removed.some((r) => r.id === e.id));
    }

    const edgeId = buildEdgeId(connection.source!, connection.target!);
    if (edges.some((e) => e.id === edgeId)) return;
    const newEdge: WorkspaceEdge = {
      id: edgeId,
      source: connection.source!,
      target: connection.target!,
      type: EDGE_TYPES.DATA_FLOW,
      data: { status: EDGE_STATUS.IDLE },
    };
    edges = [...edges, newEdge];
    set({ edges });
    syncDomainForNewEdge(newEdge, get().nodes, edges);
  },

  addNode: (type, position) => {
    const state = get();

    if (INPUT_NODE_TYPES.has(type) && state.nodes.some((n) => n.type === type)) return undefined;
    if (type === NODE_TYPES.HYPOTHESIS && !state.nodes.some((n) => n.type === NODE_TYPES.INCUBATOR)) return undefined;

    const id = `${type}-${generateId()}`;
    const col = columnX(state.colGap);
    const targetPos = snap(position ?? computeDefaultPosition(type, state.nodes, col));

    const newNode: WorkspaceNode = {
      id,
      type,
      position: targetPos,
      data: { ...PREREQUISITE_DEFAULTS[type] },
    };

    let intermediateNodes = state.nodes;
    const prereqType = findMissingPrerequisite(type, state.nodes);
    if (prereqType) {
      const prereqId = `${prereqType}-${generateId()}`;
      const prereqNode: WorkspaceNode = {
        id: prereqId,
        type: prereqType as CanvasNodeType,
        position: computeAdjacentPosition(targetPos, state.colGap),
        data: PREREQUISITE_DEFAULTS[prereqType] ?? {},
      };
      intermediateNodes = [...intermediateNodes, prereqNode];
    }

    const structuralEdges = buildAutoConnectEdges(id, type, intermediateNodes);
    const modelEdges = buildModelEdgeForNode(id, type, intermediateNodes);

    if (type === NODE_TYPES.HYPOTHESIS) {
      const pendingEdges = [...state.edges, ...structuralEdges, ...modelEdges];
      const nodesWithNew: WorkspaceNode[] = [...intermediateNodes, newNode];
      const refId = ensureHypothesisStrategyBinding(id, nodesWithNew, pendingEdges);
      if (refId) {
        newNode.data = { ...newNode.data, refId };
      }
    }

    set({
      nodes: reconcileEphemeralGhostNodes(
        [...intermediateNodes, newNode],
      ),
      edges: [...state.edges, ...structuralEdges, ...modelEdges],
    });
    get().applyAutoLayout();
    return id;
  },

  materializeOptionalInputNodesFromSpec: (spec: DesignSpec) => {
    for (const slot of optionalInputSlotsWithSpecMaterial(spec)) {
      if (get().nodes.some((n) => n.type === slot)) continue;
      get().addNode(slot);
    }
    const nodes = get().nodes;
    const edges = get().edges;
    hydrateDomainAfterSpecMaterialize(nodes, edges);
    get().applyAutoLayout();
  },

  removeNode: (nodeId) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (REMOVE_PROTECTED_NODE_TYPES.has(node.type)) {
      return;
    }

    resetSpecSectionForRemovedNode(node);

    syncDomainForRemovedNode(node);

    if (node.type === NODE_TYPES.INCUBATOR) {
      removeCompilerPlanForNode(nodeId);
    }

    const removeIds = new Set<string>([nodeId]);
    if (node.type === NODE_TYPES.HYPOTHESIS) {
      const refId = getHypothesisRefId(node);
      if (refId) removeCompilerStrategyByRefId(refId);
      for (const e of state.edges) {
        if (e.source !== nodeId) continue;
        const target = state.nodes.find((n) => n.id === e.target && n.type === NODE_TYPES.PREVIEW);
        if (target) removeIds.add(target.id);
      }
    }

    const inspectorId = get().runInspectorPreviewNodeId;
    const expandedId = get().expandedPreviewId;
    const clearInspector =
      inspectorId != null && [...removeIds].some((rid) => rid === inspectorId);
    const clearExpanded =
      expandedId != null && [...removeIds].some((rid) => rid === expandedId);
    const nextPreviewMap = new Map(get().previewNodeIdMap);
    for (const [k, v] of nextPreviewMap) {
      if (removeIds.has(v)) nextPreviewMap.delete(k);
    }
    set({
      nodes: reconcileEphemeralGhostNodes(
        state.nodes.filter((n) => !removeIds.has(n.id)),
      ),
      edges: state.edges.filter(
        (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
      ),
      previewNodeIdMap: nextPreviewMap,
      ...(clearInspector ? { runInspectorPreviewNodeId: null as string | null } : {}),
      ...(clearExpanded ? { expandedPreviewId: null as string | null } : {}),
    });
    get().applyAutoLayout();
  },

  removeEdge: (edgeId) => {
    const state = get();
    set({ edges: removeEdgesAndSync(state, (e) => e.id === edgeId) });
  },

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    });
    const n = get().nodes.find((x) => x.id === nodeId);
    if (!n) return;
    const merged = { ...n.data, ...data };
    const mergedNode = { ...n, data: merged } as WorkspaceNode;
    syncNodeDataToWorkspaceDomain(n, mergedNode, data);
  },

  disconnectOutputs: (nodeId) => {
    const state = get();
    set({ edges: removeEdgesAndSync(state, (e) => e.source === nodeId) });
  },
});
