/**
 * Pure graph topology queries over `WorkspaceNode` / `WorkspaceEdge`.
 * Centralizes edge-walking so alternate UIs or persistence can reuse or replace this layer.
 */
import { DEFAULT_COMPILER_PROVIDER } from '../lib/constants';
import { NODE_TYPES } from '../constants/canvas';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';

export interface WorkspaceGraphSnapshot {
  readonly nodes: readonly WorkspaceNode[];
  readonly edges: readonly WorkspaceEdge[];
}

export function nodeById(
  snapshot: WorkspaceGraphSnapshot,
  id: string,
): WorkspaceNode | undefined {
  return snapshot.nodes.find((n) => n.id === id);
}

export function listIncomingSourceNodes(
  targetNodeId: string,
  snapshot: WorkspaceGraphSnapshot,
): WorkspaceNode[] {
  const out: WorkspaceNode[] = [];
  for (const e of snapshot.edges) {
    if (e.target !== targetNodeId) continue;
    const n = nodeById(snapshot, e.source);
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
    const n = nodeById(snapshot, e.target);
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
    const source = nodeById(snapshot, e.source);
    if (source?.type === NODE_TYPES.MODEL) return source.id;
  }
  return null;
}

/** All model nodes with an edge into `targetNodeId` (order = edge iteration). */
export function listIncomingModelNodeIds(
  targetNodeId: string,
  snapshot: WorkspaceGraphSnapshot,
): string[] {
  const ids: string[] = [];
  for (const e of snapshot.edges) {
    if (e.target !== targetNodeId) continue;
    const source = nodeById(snapshot, e.source);
    if (source?.type === NODE_TYPES.MODEL) ids.push(source.id);
  }
  return ids;
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
    const providerId = (src.data.providerId as string) || DEFAULT_COMPILER_PROVIDER;
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
