/**
 * Adapter between framework-neutral `Workspace*` graph types and @xyflow/react.
 * Keep all direct @xyflow/react imports for node/edge mutation and typing in this file.
 */
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { EDGE_STATUS, EDGE_TYPES } from '../constants/canvas';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';

export type { Connection, EdgeChange, NodeChange };

function toReactFlowNode(node: WorkspaceNode): Node {
  return { ...node } as Node;
}

export function toReactFlowNodes(nodes: WorkspaceNode[]): Node[] {
  return nodes.map(toReactFlowNode);
}

function fromReactFlowNode(node: Node): WorkspaceNode {
  const w: WorkspaceNode = {
    id: node.id,
    type: node.type as WorkspaceNode['type'],
    position: { x: node.position.x, y: node.position.y },
    data: { ...node.data } as WorkspaceNode['data'],
  };
  if (node.measured) w.measured = node.measured;
  if (node.width !== undefined) w.width = node.width;
  if (node.height !== undefined) w.height = node.height;
  return w;
}

function toReactFlowEdge(edge: WorkspaceEdge): Edge {
  return { ...edge } as Edge;
}

export function toReactFlowEdges(edges: WorkspaceEdge[]): Edge[] {
  return edges.map(toReactFlowEdge);
}

function fromReactFlowEdge(edge: Edge): WorkspaceEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type ?? EDGE_TYPES.DATA_FLOW,
    data: (edge.data as WorkspaceEdge['data'] | undefined) ?? { status: EDGE_STATUS.IDLE },
  };
}

export function applyWorkspaceNodeChanges(
  changes: NodeChange<Node>[],
  nodes: WorkspaceNode[],
): WorkspaceNode[] {
  const next = applyNodeChanges(changes, toReactFlowNodes(nodes) as Node[]);
  return next.map(fromReactFlowNode);
}

export function applyWorkspaceEdgeChanges(
  changes: EdgeChange<Edge>[],
  edges: WorkspaceEdge[],
): WorkspaceEdge[] {
  const next = applyEdgeChanges(changes, toReactFlowEdges(edges) as Edge[]);
  return next.map(fromReactFlowEdge);
}
