import type { StateCreator } from 'zustand';
import { INPUT_GHOST_NODE_TYPE } from '../../constants/canvas';
import type { DesignSpec } from '../../types/spec';
import {
  applyWorkspaceEdgeChanges,
  applyWorkspaceNodeChanges,
} from '../../workspace/reactflow-adapter';
import { generateId } from '../../lib/utils';
import { reconcileEphemeralGhostNodes } from '../../lib/canvas-layout';
import {
  isValidConnection as checkValidConnection,
} from '../../lib/canvas-connections';
import {
  planAddNodeMutation,
  planConnectionMutation,
  planEdgeRemoval,
  planNodeDataUpdate,
  planOptionalInputMaterialization,
  planRemoveNodeMutation,
  shouldIgnoreNodeChangeRemoval,
} from '../../workspace/canvas-mutation-planner';
import {
  scheduleDebouncedAutoLayout,
  shouldScheduleAutoLayoutOnDimensionChange,
} from '../canvas/dimension-layout-debounce';
import type { CanvasStore } from './canvas-store-types';
import {
  commitAddNodeTransaction,
  commitEdgeChangesTransaction,
  commitConnectionTransaction,
  commitEdgeRemovalTransaction,
  commitNodeDataTransaction,
  commitOptionalInputMaterializationTransaction,
  commitRemoveNodeTransaction,
} from './canvas-graph-transaction';

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
    commitEdgeChangesTransaction(prev, next, get().nodes, set);
  },

  isValidConnection: (connection) => {
    const { nodes } = get();
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;
    if (sourceNode.type === INPUT_GHOST_NODE_TYPE || targetNode.type === INPUT_GHOST_NODE_TYPE) {
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
    commitConnectionTransaction(plan, nodes, set);
  },

  addNode: (type, position) => {
    const state = get();
    const plan = planAddNodeMutation({
      type,
      position,
      nodes: state.nodes,
      edges: state.edges,
      colGap: state.colGap,
      generateId,
    });
    if (!plan) return undefined;

    return commitAddNodeTransaction(plan, reconcileEphemeralGhostNodes, set, get().applyAutoLayout);
  },

  materializeOptionalInputNodesFromSpec: (spec: DesignSpec) => {
    commitOptionalInputMaterializationTransaction({
      slots: planOptionalInputMaterialization(spec, get().nodes),
      addNode: get().addNode,
      getNodes: () => get().nodes,
      getEdges: () => get().edges,
      applyAutoLayout: get().applyAutoLayout,
    });
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

    commitRemoveNodeTransaction(plan, nodeId, set, get().applyAutoLayout);
  },

  removeEdge: (edgeId) => {
    const state = get();
    const plan = planEdgeRemoval(state.edges, (e) => e.id === edgeId);
    commitEdgeRemovalTransaction(plan, state.nodes, set);
  },

  updateNodeData: (nodeId, data) => {
    const plan = planNodeDataUpdate({ nodeId, nodes: get().nodes, data });
    if (!plan) return;
    commitNodeDataTransaction(plan, data, set);
  },

  disconnectOutputs: (nodeId) => {
    const state = get();
    const plan = planEdgeRemoval(state.edges, (e) => e.source === nodeId);
    commitEdgeRemovalTransaction(plan, state.nodes, set);
  },
});
