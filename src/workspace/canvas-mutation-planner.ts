import { EDGE_STATUS, EDGE_TYPES, NODE_TYPES, buildEdgeId } from '../constants/canvas';
import { isEphemeralInputGhostId, reconcileEphemeralGhostNodes } from '../lib/canvas-layout';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';

export const REMOVE_PROTECTED_NODE_TYPES = new Set<string>([
  NODE_TYPES.DESIGN_BRIEF,
  NODE_TYPES.MODEL,
  NODE_TYPES.INCUBATOR,
  'inputGhost',
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
