import {
  buildPaletteModelEdgesForNode,
  buildScopedModelEdgesFromParent,
  buildStructuralAutoConnectEdges,
  buildValidConnectionMap,
  findMissingPrerequisiteFromContracts,
  type AutoEdge,
} from '../workspace/canvas-edge-contracts';

// Local mirror of CanvasNodeType (avoids circular import with canvas-store)
type NodeType =
  | 'designBrief' | 'researchContext'
  | 'objectivesMetrics' | 'designConstraints' | 'designSystem'
  | 'incubator' | 'hypothesis' | 'preview'
  | 'model';

// ── Topology ────────────────────────────────────────────────────────

/** Valid source→target type pairs for manual edge creation */
export const VALID_CONNECTIONS: Record<NodeType, Set<NodeType>> = buildValidConnectionMap();

export function isValidConnection(sourceType: string, targetType: string): boolean {
  return (VALID_CONNECTIONS as Record<string, Set<string>>)[sourceType]?.has(targetType) ?? false;
}

// ── Prerequisite rules ──────────────────────────────────────────────

export function findMissingPrerequisite(
  newNodeType: string,
  existingNodes: MinimalNode[],
): string | null {
  return findMissingPrerequisiteFromContracts(newNodeType, existingNodes);
}

// ── Edge helpers ────────────────────────────────────────────────────

interface MinimalNode { id: string; type?: string }
interface MinimalEdge { source: string; target: string }

/** Deduplicate edges by `id` (first wins). Prevents React Flow duplicate-key warnings when state merges overlap. */
export function dedupeEdgesById<T extends { id: string }>(edges: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of edges) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

// ── Auto-connect (palette / manual add) ─────────────────────────────

/**
 * Compute structural edges when a node is added from the palette.
 * Model connections are handled separately via buildModelEdgeForNode
 * or buildModelEdgesFromParent — this only wires inputs↔incubator
 * and designSystem↔hypothesis.
 */
export function buildAutoConnectEdges(
  newNodeId: string,
  type: string,
  existingNodes: MinimalNode[],
): AutoEdge[] {
  return buildStructuralAutoConnectEdges(newNodeId, type, existingNodes);
}

// ── Scoped model connection ─────────────────────────────────────────

/**
 * Find model node(s) connected as inputs to a specific node.
 */
/**
 * Build model→child edges scoped to a specific parent.
 * Uses the **first** model wired to the parent only — a hypothesis (or design system)
 * may only have one model edge; incubators may still have multiple models upstream.
 * Falls back to the first model on the canvas if the parent has none.
 */
export function buildModelEdgesFromParent(
  parentId: string,
  childIds: string[],
  nodes: MinimalNode[],
  edges: MinimalEdge[],
): AutoEdge[] {
  return buildScopedModelEdgesFromParent(parentId, childIds, nodes, edges);
}

/**
 * Build a model edge for a single node added from the palette.
 * Connects the first available model (no parent context).
 */
export function buildModelEdgeForNode(
  nodeId: string,
  nodeType: string,
  existingNodes: MinimalNode[],
): AutoEdge[] {
  return buildPaletteModelEdgesForNode(nodeId, nodeType, existingNodes);
}
