/**
 * Pure graph topology queries over `WorkspaceNode` / `WorkspaceEdge`.
 * Centralizes edge-walking so alternate UIs or persistence can reuse or replace this layer.
 */
import { DEFAULT_INCUBATOR_PROVIDER } from '../lib/constants';
import { NODE_TYPES } from '../constants/canvas';
import type { CanvasNodeType, WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';

/** Coerce a persisted/snapshot node row into `WorkspaceNode` for graph helpers (dummy position). */
export function snapshotNodeToWorkspace(n: {
  id: string;
  type: CanvasNodeType;
  data: Record<string, unknown>;
}): WorkspaceNode {
  return {
    id: n.id,
    type: n.type,
    position: { x: 0, y: 0 },
    data: n.data as WorkspaceNode['data'],
  };
}

export interface WorkspaceGraphSnapshot {
  readonly nodes: readonly WorkspaceNode[];
  readonly edges: readonly WorkspaceEdge[];
}

export function workspaceNodeById(
  nodes: readonly WorkspaceNode[],
  id: string,
): WorkspaceNode | undefined {
  return nodes.find((n) => n.id === id);
}

export function nodeById(
  snapshot: WorkspaceGraphSnapshot,
  id: string,
): WorkspaceNode | undefined {
  return workspaceNodeById(snapshot.nodes, id);
}

/** Minimal graph snapshot for incubator lookup (avoids scattering nodes/edges arg order). */
export type IncubatorLookupSnapshot = {
  readonly nodes: readonly { id: string; type: string }[];
  readonly edges: readonly Pick<WorkspaceEdge, 'source' | 'target'>[];
};

/**
 * First compiler node with an edge to this hypothesis (`source` → `target`).
 * Uses the same iteration order as legacy inline loops.
 */
export function findIncubatorForHypothesis(
  snapshot: IncubatorLookupSnapshot,
  hypothesisId: string,
): string | null {
  for (const e of snapshot.edges) {
    if (e.target !== hypothesisId) continue;
    const n = snapshot.nodes.find((x) => x.id === e.source);
    if (n?.type === NODE_TYPES.INCUBATOR) return n.id;
  }
  return null;
}

export function listIncomingSourceNodes(
  targetNodeId: string,
  snapshot: WorkspaceGraphSnapshot,
): WorkspaceNode[] {
  const out: WorkspaceNode[] = [];
  for (const e of snapshot.edges) {
    if (e.target !== targetNodeId) continue;
    const n = workspaceNodeById(snapshot.nodes, e.source);
    if (n) out.push(n);
  }
  return out;
}

export function listOutgoingTargetNodes(
  sourceNodeId: string,
  snapshot: WorkspaceGraphSnapshot,
): WorkspaceNode[] {
  const out: WorkspaceNode[] = [];
  for (const e of snapshot.edges) {
    if (e.source !== sourceNodeId) continue;
    const n = workspaceNodeById(snapshot.nodes, e.target);
    if (n) out.push(n);
  }
  return out;
}

/**
 * First incoming edge from a `model` node (iteration order matches previous inline loops).
 */
export function findFirstUpstreamModelNodeId(
  targetNodeId: string,
  snapshot: WorkspaceGraphSnapshot,
): string | null {
  for (const e of snapshot.edges) {
    if (e.target !== targetNodeId) continue;
    const source = workspaceNodeById(snapshot.nodes, e.source);
    if (source?.type === NODE_TYPES.MODEL) return source.id;
  }
  return null;
}

export interface ModelCredential {
  readonly providerId: string;
  readonly modelId: string;
}

/**
 * All connected Model nodes that have a non-empty `modelId` (multi-model generation).
 */
export function listIncomingModelCredentials(
  targetNodeId: string,
  snapshot: WorkspaceGraphSnapshot,
): ModelCredential[] {
  const out: ModelCredential[] = [];
  for (const src of listIncomingSourceNodes(targetNodeId, snapshot)) {
    if (src.type !== NODE_TYPES.MODEL) continue;
    const modelId = src.data.modelId as string | undefined;
    if (!modelId) continue;
    const providerId = (src.data.providerId as string) || DEFAULT_INCUBATOR_PROVIDER;
    out.push({ providerId, modelId });
  }
  return out;
}

/** Model nodes wired to this target that have a selected `modelId` (for UI counts). */
export function countIncomingModelsWithModelSelected(
  targetNodeId: string,
  snapshot: WorkspaceGraphSnapshot,
): number {
  return listIncomingSourceNodes(targetNodeId, snapshot).filter(
    (n) => n.type === NODE_TYPES.MODEL && Boolean(n.data.modelId),
  ).length;
}

export function countOutgoingNodesOfType(
  sourceNodeId: string,
  nodeType: WorkspaceNode['type'],
  snapshot: WorkspaceGraphSnapshot,
): number {
  return listOutgoingTargetNodes(sourceNodeId, snapshot).filter((n) => n.type === nodeType)
    .length;
}
