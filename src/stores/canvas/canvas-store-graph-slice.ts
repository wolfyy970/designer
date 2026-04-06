import type { StateCreator } from 'zustand';
import type { InputGhostTargetType } from '../../types/canvas-data';
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
  reconcileInputGhostNodes,
  OPTIONAL_INPUT_SLOTS,
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
  ensureCompilerVariantAndDomainForHypothesis,
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
    | 'dismissInputGhostSlot'
  >
> = (set, get) => ({
  onNodesChange: (changes) => {
    const filtered = changes.filter((ch) => {
      if (ch.type !== 'remove') return true;
      const id = 'id' in ch ? (ch.id as string) : '';
      return !isEphemeralInputGhostId(id);
    });
    set({ nodes: applyWorkspaceNodeChanges(filtered, get().nodes) });
    if (shouldScheduleAutoLayoutOnDimensionChange(get().autoLayout, filtered)) {
      scheduleDebouncedAutoLayout(get);
    }
  },

  onEdgesChange: (changes) => {
    const prev = get().edges;
    const next = applyWorkspaceEdgeChanges(changes, prev);
    const nextIds = new Set(next.map((e) => e.id));
    const removed = prev.filter((e) => !nextIds.has(e.id));
    const nodes = get().nodes;
    for (const e of removed) {
      syncDomainForRemovedEdge(e, nodes);
    }
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

  dismissInputGhostSlot: (targetType: InputGhostTargetType) => {
    const current = get().dismissedInputGhostSlots;
    if (current.includes(targetType)) return;
    const dismissedInputGhostSlots = [...current, targetType];
    set({
      dismissedInputGhostSlots,
      inputGhostToolbarNudge: true,
      nodes: reconcileInputGhostNodes(get().nodes, dismissedInputGhostSlots),
    });
    if (get().autoLayout) get().applyAutoLayout();
  },

  onConnect: (connection) => {
    if (!get().isValidConnection(connection)) return;
    const edgeId = buildEdgeId(connection.source!, connection.target!);
    if (get().edges.some((e) => e.id === edgeId)) return;
    const newEdge: WorkspaceEdge = {
      id: edgeId,
      source: connection.source!,
      target: connection.target!,
      type: EDGE_TYPES.DATA_FLOW,
      data: { status: EDGE_STATUS.IDLE },
    };
    const edges = [...get().edges, newEdge];
    set({ edges });
    syncDomainForNewEdge(newEdge, get().nodes, edges);
  },

  addNode: (type, position) => {
    const state = get();

    if (INPUT_NODE_TYPES.has(type) && state.nodes.some((n) => n.type === type)) return;
    if (type === NODE_TYPES.HYPOTHESIS && !state.nodes.some((n) => n.type === NODE_TYPES.INCUBATOR)) return;

    const dismissedInputGhostSlots = (OPTIONAL_INPUT_SLOTS as readonly string[]).includes(type)
      ? state.dismissedInputGhostSlots.filter((s) => s !== type)
      : state.dismissedInputGhostSlots;

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
      const refId = ensureCompilerVariantAndDomainForHypothesis(id, nodesWithNew, pendingEdges);
      if (refId) {
        newNode.data = { ...newNode.data, refId };
      }
    }

    set({
      dismissedInputGhostSlots,
      nodes: reconcileInputGhostNodes(
        [...intermediateNodes, newNode],
        dismissedInputGhostSlots,
      ),
      edges: [...state.edges, ...structuralEdges, ...modelEdges],
    });
    if (get().autoLayout) get().applyAutoLayout();
  },

  materializeOptionalInputNodesFromSpec: (spec: DesignSpec) => {
    for (const slot of optionalInputSlotsWithSpecMaterial(spec)) {
      if (get().nodes.some((n) => n.type === slot)) continue;
      get().addNode(slot);
    }
    const nodes = get().nodes;
    const edges = get().edges;
    hydrateDomainAfterSpecMaterialize(nodes, edges);
    if (get().autoLayout) get().applyAutoLayout();
  },

  removeNode: (nodeId) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.type === 'inputGhost') return;

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
      nodes: reconcileInputGhostNodes(
        state.nodes.filter((n) => !removeIds.has(n.id)),
        state.dismissedInputGhostSlots,
      ),
      edges: state.edges.filter(
        (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
      ),
      previewNodeIdMap: nextPreviewMap,
      ...(clearInspector ? { runInspectorPreviewNodeId: null as string | null } : {}),
      ...(clearExpanded ? { expandedPreviewId: null as string | null } : {}),
    });
    if (get().autoLayout) get().applyAutoLayout();
  },

  removeEdge: (edgeId) => {
    set({ edges: get().edges.filter((e) => e.id !== edgeId) });
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
    set({
      edges: get().edges.filter((e) => e.source !== nodeId),
    });
  },
});
