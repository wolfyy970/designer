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
  snap,
} from '../../lib/canvas-layout';
import { NODE_TYPES, INPUT_NODE_TYPES } from '../../constants/canvas';
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
  planConnectionMutation,
  planEdgeRemoval,
  planRemoveNodeMutation,
  shouldIgnoreNodeChangeRemoval,
} from '../../workspace/canvas-mutation-planner';
import {
  scheduleDebouncedAutoLayout,
  shouldScheduleAutoLayoutOnDimensionChange,
} from '../canvas/dimension-layout-debounce';
import { optionalInputSlotsWithSpecMaterial } from '../../lib/spec-materialize-sections';
import type { CanvasStore } from './canvas-store-types';

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
  const plan = planEdgeRemoval(state.edges, shouldRemove);
  syncRemovedEdges(plan.removedEdges, state.nodes);
  return plan.nextEdges;
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
      return !shouldIgnoreNodeChangeRemoval(id, get().nodes);
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

    const plan = planConnectionMutation({
      source: connection.source!,
      target: connection.target!,
      nodes,
      edges: get().edges,
    });
    syncRemovedEdges(plan.removedEdges, nodes);
    if (!plan.newEdge) return;
    set({ edges: plan.nextEdges });
    syncDomainForNewEdge(plan.newEdge, get().nodes, plan.nextEdges);
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
    const plan = planRemoveNodeMutation({
      nodeId,
      nodes: state.nodes,
      edges: state.edges,
      previewNodeIdMap: state.previewNodeIdMap,
      runInspectorPreviewNodeId: state.runInspectorPreviewNodeId,
      expandedPreviewId: state.expandedPreviewId,
    });
    if (!plan) return;
    const { node } = plan;

    resetSpecSectionForRemovedNode(node);

    syncDomainForRemovedNode(node);

    if (node.type === NODE_TYPES.INCUBATOR) {
      removeCompilerPlanForNode(nodeId);
    }

    if (node.type === NODE_TYPES.HYPOTHESIS) {
      const refId = getHypothesisRefId(node);
      if (refId) removeCompilerStrategyByRefId(refId);
    }

    set({
      nodes: plan.nextNodes,
      edges: plan.nextEdges,
      previewNodeIdMap: plan.nextPreviewNodeIdMap,
      ...(plan.clearInspector ? { runInspectorPreviewNodeId: null as string | null } : {}),
      ...(plan.clearExpanded ? { expandedPreviewId: null as string | null } : {}),
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
