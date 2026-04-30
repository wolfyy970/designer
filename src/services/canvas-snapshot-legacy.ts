import { stripLegacyExistingDesignSection } from '../lib/spec-legacy';
import type { DesignSpec } from '../types/spec';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import { snapshotClone } from './canvas-snapshot-serialization';

const LEGACY_EXISTING_DESIGN_NODE_TYPE = 'existingDesign';

export function stripLegacyExistingDesignSpec(spec: DesignSpec): DesignSpec {
  return stripLegacyExistingDesignSection(snapshotClone(spec));
}

export function stripLegacyExistingDesignGraph(
  nodes: WorkspaceNode[],
  edges: WorkspaceEdge[],
): { nodes: WorkspaceNode[]; edges: WorkspaceEdge[]; removedNodeIds: Set<string> } {
  const removedNodeIds = new Set<string>();
  const nextNodes = nodes.filter((node) => {
    const nodeType = (node as { type?: string }).type;
    const targetType = typeof node.data === 'object' && node.data !== null
      ? (node.data as Record<string, unknown>).targetType
      : undefined;
    const remove =
      nodeType === LEGACY_EXISTING_DESIGN_NODE_TYPE
      || (nodeType === 'inputGhost' && targetType === LEGACY_EXISTING_DESIGN_NODE_TYPE);
    if (remove) removedNodeIds.add(node.id);
    return !remove;
  });
  const nextEdges = edges.filter((edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target));
  return { nodes: nextNodes, edges: nextEdges, removedNodeIds };
}
