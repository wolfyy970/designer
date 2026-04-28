import { EDGE_STATUS, EDGE_TYPES, INPUT_GHOST_NODE_TYPE, NODE_TYPES, buildEdgeId } from '../constants/canvas';
import { INPUT_NODE_TYPES } from '../constants/canvas';
import {
  columnX,
  computeAdjacentPosition,
  computeDefaultPosition,
  isEphemeralInputGhostId,
  reconcileEphemeralGhostNodes,
  snap,
} from '../lib/canvas-layout';
import {
  buildAutoConnectEdges,
  buildModelEdgeForNode,
  findMissingPrerequisite,
} from '../lib/canvas-connections';
import { PREREQUISITE_DEFAULTS } from '../lib/constants';
import { optionalInputSlotsWithSpecMaterial } from '../lib/spec-materialize-sections';
import type { DesignSpec } from '../types/spec';
import type { CanvasNodeType, WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';

export const REMOVE_PROTECTED_NODE_TYPES = new Set<string>([
  NODE_TYPES.DESIGN_BRIEF,
  NODE_TYPES.MODEL,
  NODE_TYPES.INCUBATOR,
  INPUT_GHOST_NODE_TYPE,
]);

export function isProtectedNodeRemoval(node: WorkspaceNode | undefined): boolean {
  return node ? REMOVE_PROTECTED_NODE_TYPES.has(node.type) : false;
}

export function shouldIgnoreNodeChangeRemoval(nodeId: string, nodes: readonly WorkspaceNode[]): boolean {
  if (isEphemeralInputGhostId(nodeId)) return true;
  return isProtectedNodeRemoval(nodes.find((node) => node.id === nodeId));
}

export interface EdgeRemovalPlan {
  removedEdges: WorkspaceEdge[];
  nextEdges: WorkspaceEdge[];
}

export function planEdgeRemoval(
  edges: readonly WorkspaceEdge[],
  shouldRemove: (edge: WorkspaceEdge) => boolean,
): EdgeRemovalPlan {
  const removedEdges = edges.filter(shouldRemove);
  if (removedEdges.length === 0) {
    return { removedEdges, nextEdges: [...edges] };
  }
  const removedIds = new Set(removedEdges.map((edge) => edge.id));
  return {
    removedEdges,
    nextEdges: edges.filter((edge) => !removedIds.has(edge.id)),
  };
}

export interface ConnectionPlan {
  removedEdges: WorkspaceEdge[];
  newEdge?: WorkspaceEdge;
  nextEdges: WorkspaceEdge[];
}

export function planConnectionMutation(input: {
  source: string;
  target: string;
  nodes: readonly WorkspaceNode[];
  edges: readonly WorkspaceEdge[];
}): ConnectionPlan {
  let edges = [...input.edges];
  let removedEdges: WorkspaceEdge[] = [];
  const sourceNode = input.nodes.find((node) => node.id === input.source);
  const targetNode = input.nodes.find((node) => node.id === input.target);

  if (sourceNode?.type === NODE_TYPES.MODEL && targetNode?.type === NODE_TYPES.HYPOTHESIS) {
    removedEdges = edges.filter((edge) => {
      if (edge.target !== input.target) return false;
      return input.nodes.find((node) => node.id === edge.source)?.type === NODE_TYPES.MODEL;
    });
    const removedIds = new Set(removedEdges.map((edge) => edge.id));
    edges = edges.filter((edge) => !removedIds.has(edge.id));
  }

  const edgeId = buildEdgeId(input.source, input.target);
  if (edges.some((edge) => edge.id === edgeId)) {
    return { removedEdges, nextEdges: edges };
  }

  const newEdge: WorkspaceEdge = {
    id: edgeId,
    source: input.source,
    target: input.target,
    type: EDGE_TYPES.DATA_FLOW,
    data: { status: EDGE_STATUS.IDLE },
  };

  return {
    removedEdges,
    newEdge,
    nextEdges: [...edges, newEdge],
  };
}

export interface RemoveNodePlan {
  node: WorkspaceNode;
  removeIds: Set<string>;
  nextNodes: WorkspaceNode[];
  nextEdges: WorkspaceEdge[];
  nextPreviewNodeIdMap: Map<string, string>;
  clearInspector: boolean;
  clearExpanded: boolean;
}

export function planRemoveNodeMutation(input: {
  nodeId: string;
  nodes: readonly WorkspaceNode[];
  edges: readonly WorkspaceEdge[];
  previewNodeIdMap: ReadonlyMap<string, string>;
  runInspectorPreviewNodeId: string | null;
  expandedPreviewId: string | null;
}): RemoveNodePlan | undefined {
  const node = input.nodes.find((candidate) => candidate.id === input.nodeId);
  if (!node || isProtectedNodeRemoval(node)) return undefined;

  const removeIds = new Set<string>([input.nodeId]);
  if (node.type === NODE_TYPES.HYPOTHESIS) {
    for (const edge of input.edges) {
      if (edge.source !== input.nodeId) continue;
      const target = input.nodes.find(
        (candidate) => candidate.id === edge.target && candidate.type === NODE_TYPES.PREVIEW,
      );
      if (target) removeIds.add(target.id);
    }
  }

  const nextPreviewNodeIdMap = new Map(input.previewNodeIdMap);
  for (const [key, value] of nextPreviewNodeIdMap) {
    if (removeIds.has(value)) nextPreviewNodeIdMap.delete(key);
  }

  return {
    node,
    removeIds,
    nextNodes: reconcileEphemeralGhostNodes(input.nodes.filter((candidate) => !removeIds.has(candidate.id))),
    nextEdges: input.edges.filter(
      (edge) => !removeIds.has(edge.source) && !removeIds.has(edge.target),
    ),
    nextPreviewNodeIdMap,
    clearInspector:
      input.runInspectorPreviewNodeId != null && removeIds.has(input.runInspectorPreviewNodeId),
    clearExpanded: input.expandedPreviewId != null && removeIds.has(input.expandedPreviewId),
  };
}

export interface AddNodePlan {
  nodeId: string;
  newNode: WorkspaceNode;
  prerequisiteNode?: WorkspaceNode;
  nodesBeforeNew: WorkspaceNode[];
  nextNodes: WorkspaceNode[];
  structuralEdges: WorkspaceEdge[];
  modelEdges: WorkspaceEdge[];
  nextEdges: WorkspaceEdge[];
  hypothesisBinding?: {
    nodeId: string;
    nodesWithNew: WorkspaceNode[];
    pendingEdges: WorkspaceEdge[];
  };
}

export function planAddNodeMutation(input: {
  type: CanvasNodeType;
  position?: { x: number; y: number };
  nodes: readonly WorkspaceNode[];
  edges: readonly WorkspaceEdge[];
  colGap: number;
  generateId: () => string;
}): AddNodePlan | undefined {
  if (INPUT_NODE_TYPES.has(input.type) && input.nodes.some((node) => node.type === input.type)) {
    return undefined;
  }
  if (
    input.type === NODE_TYPES.HYPOTHESIS &&
    !input.nodes.some((node) => node.type === NODE_TYPES.INCUBATOR)
  ) {
    return undefined;
  }

  const nodeId = `${input.type}-${input.generateId()}`;
  const col = columnX(input.colGap);
  const existingNodes = [...input.nodes];
  const targetPos = snap(input.position ?? computeDefaultPosition(input.type, existingNodes, col));
  const newNode: WorkspaceNode = {
    id: nodeId,
    type: input.type,
    position: targetPos,
    data: { ...PREREQUISITE_DEFAULTS[input.type] },
  };

  let nodesBeforeNew = existingNodes;
  let prerequisiteNode: WorkspaceNode | undefined;
  const prereqType = findMissingPrerequisite(input.type, existingNodes);
  if (prereqType) {
    prerequisiteNode = {
      id: `${prereqType}-${input.generateId()}`,
      type: prereqType as CanvasNodeType,
      position: computeAdjacentPosition(targetPos, input.colGap),
      data: PREREQUISITE_DEFAULTS[prereqType] ?? {},
    };
    nodesBeforeNew = [...nodesBeforeNew, prerequisiteNode];
  }

  const structuralEdges = buildAutoConnectEdges(nodeId, input.type, nodesBeforeNew);
  const modelEdges = buildModelEdgeForNode(nodeId, input.type, nodesBeforeNew);
  const nodesWithNew = [...nodesBeforeNew, newNode];
  const nextEdges = [...input.edges, ...structuralEdges, ...modelEdges];

  return {
    nodeId,
    newNode,
    prerequisiteNode,
    nodesBeforeNew,
    nextNodes: reconcileEphemeralGhostNodes(nodesWithNew),
    structuralEdges,
    modelEdges,
    nextEdges,
    hypothesisBinding:
      input.type === NODE_TYPES.HYPOTHESIS
        ? { nodeId, nodesWithNew, pendingEdges: nextEdges }
        : undefined,
  };
}

export function planOptionalInputMaterialization(spec: DesignSpec, nodes: readonly WorkspaceNode[]): CanvasNodeType[] {
  return optionalInputSlotsWithSpecMaterial(spec).filter(
    (slot) => !nodes.some((node) => node.type === slot),
  );
}

export interface NodeDataUpdatePlan {
  previousNode: WorkspaceNode;
  mergedNode: WorkspaceNode;
  nextNodes: WorkspaceNode[];
}

export function planNodeDataUpdate(input: {
  nodeId: string;
  nodes: readonly WorkspaceNode[];
  data: Record<string, unknown>;
}): NodeDataUpdatePlan | undefined {
  const previousNode = input.nodes.find((node) => node.id === input.nodeId);
  if (!previousNode) return undefined;
  const mergedNode = {
    ...previousNode,
    data: { ...previousNode.data, ...input.data },
  } as WorkspaceNode;
  return {
    previousNode,
    mergedNode,
    nextNodes: input.nodes.map((node) => (node.id === input.nodeId ? mergedNode : node)),
  };
}
