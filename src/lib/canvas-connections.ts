import { NODE_TYPES, EDGE_TYPES, EDGE_STATUS, buildEdgeId } from '../constants/canvas';

// Local mirror of CanvasNodeType (avoids circular import with canvas-store)
type NodeType =
  | 'designBrief' | 'existingDesign' | 'researchContext'
  | 'objectivesMetrics' | 'designConstraints' | 'designSystem'
  | 'compiler' | 'hypothesis' | 'variant'
  | 'model';

// ── Topology ────────────────────────────────────────────────────────

/** Valid source→target type pairs for manual edge creation */
export const VALID_CONNECTIONS: Record<NodeType, Set<NodeType>> = {
  designBrief: new Set(['compiler']),
  existingDesign: new Set(['compiler']),
  researchContext: new Set(['compiler']),
  objectivesMetrics: new Set(['compiler']),
  designConstraints: new Set(['compiler']),
  designSystem: new Set(['hypothesis']),
  compiler: new Set(['hypothesis']),
  hypothesis: new Set(['variant']),
  variant: new Set(['compiler', 'existingDesign']),
  model: new Set(['compiler', 'hypothesis', 'designSystem']),
};

export function isValidConnection(sourceType: string, targetType: string): boolean {
  return (VALID_CONNECTIONS as Record<string, Set<string>>)[sourceType]?.has(targetType) ?? false;
}

// ── Prerequisite rules ──────────────────────────────────────────────

const PREREQUISITE_RULES: Partial<Record<string, string>> = {
  compiler: 'model',
  hypothesis: 'model',
  designSystem: 'model',
};

export function findMissingPrerequisite(
  newNodeType: string,
  existingNodes: MinimalNode[],
): string | null {
  const requiredType = PREREQUISITE_RULES[newNodeType];
  if (!requiredType) return null;
  if (existingNodes.some((n) => n.type === requiredType)) return null;
  return requiredType;
}

// ── Edge helpers ────────────────────────────────────────────────────

interface MinimalNode { id: string; type?: string }
interface MinimalEdge { source: string; target: string }
export interface AutoEdge { id: string; source: string; target: string; type: typeof EDGE_TYPES.DATA_FLOW; data: { status: typeof EDGE_STATUS.IDLE } }

const SECTION_TYPES: Set<string> = new Set([
  NODE_TYPES.DESIGN_BRIEF, NODE_TYPES.EXISTING_DESIGN, NODE_TYPES.RESEARCH_CONTEXT,
  NODE_TYPES.OBJECTIVES_METRICS, NODE_TYPES.DESIGN_CONSTRAINTS,
]);

function makeEdge(source: string, target: string): AutoEdge {
  return { id: buildEdgeId(source, target), source, target, type: EDGE_TYPES.DATA_FLOW, data: { status: EDGE_STATUS.IDLE } };
}

// ── Auto-connect (palette / manual add) ─────────────────────────────

/**
 * Compute structural edges when a node is added from the palette.
 * Model connections are handled separately via buildModelEdgeForNode
 * or buildModelEdgesFromParent — this only wires sections↔compiler
 * and designSystem↔hypothesis.
 */
export function buildAutoConnectEdges(
  newNodeId: string,
  type: string,
  existingNodes: MinimalNode[],
): AutoEdge[] {
  const edges: AutoEdge[] = [];

  if (SECTION_TYPES.has(type)) {
    const compilers = existingNodes.filter((n) => n.type === NODE_TYPES.COMPILER);
    if (compilers.length === 1) {
      edges.push(makeEdge(newNodeId, compilers[0].id));
    }
  }

  if (type === NODE_TYPES.COMPILER) {
    const existingCompilers = existingNodes.filter((n) => n.type === NODE_TYPES.COMPILER);
    if (existingCompilers.length === 0) {
      for (const sn of existingNodes.filter((n) => SECTION_TYPES.has(n.type ?? ''))) {
        edges.push(makeEdge(sn.id, newNodeId));
      }
    }
  }

  if (type === NODE_TYPES.DESIGN_SYSTEM) {
    for (const hyp of existingNodes.filter((n) => n.type === NODE_TYPES.HYPOTHESIS)) {
      edges.push(makeEdge(newNodeId, hyp.id));
    }
  }

  if (type === NODE_TYPES.HYPOTHESIS) {
    for (const ds of existingNodes.filter((n) => n.type === NODE_TYPES.DESIGN_SYSTEM)) {
      edges.push(makeEdge(ds.id, newNodeId));
    }
  }

  return edges;
}

// ── Scoped model connection ─────────────────────────────────────────

/**
 * Find model node(s) connected as inputs to a specific node.
 */
function findModelsConnectedTo(
  parentId: string,
  nodes: MinimalNode[],
  edges: MinimalEdge[],
): MinimalNode[] {
  const modelIds = new Set<string>();
  for (const e of edges) {
    if (e.target === parentId) {
      const source = nodes.find((n) => n.id === e.source);
      if (source?.type === NODE_TYPES.MODEL) modelIds.add(source.id);
    }
  }
  return nodes.filter((n) => modelIds.has(n.id));
}

/**
 * Build model→child edges scoped to a specific parent.
 * Propagates the parent's model connections to the child nodes.
 * Falls back to the first model on the canvas if the parent has none.
 */
export function buildModelEdgesFromParent(
  parentId: string,
  childIds: string[],
  nodes: MinimalNode[],
  edges: MinimalEdge[],
): AutoEdge[] {
  let models = findModelsConnectedTo(parentId, nodes, edges);

  if (models.length === 0) {
    const firstModel = nodes.find((n) => n.type === NODE_TYPES.MODEL);
    if (firstModel) models = [firstModel];
  }

  const result: AutoEdge[] = [];
  for (const model of models) {
    for (const childId of childIds) {
      result.push(makeEdge(model.id, childId));
    }
  }
  return result;
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
  const needsModel: Set<string> = new Set([NODE_TYPES.COMPILER, NODE_TYPES.HYPOTHESIS, NODE_TYPES.DESIGN_SYSTEM]);
  if (!needsModel.has(nodeType)) return [];

  const models = existingNodes.filter((n) => n.type === NODE_TYPES.MODEL);
  if (models.length === 0) return [];

  return [makeEdge(models[0].id, nodeId)];
}
