import type { HypothesisNodeData } from '../types/canvas-data';
import type { WorkspaceNode } from '../types/workspace-graph';

/** Runtime check for hypothesis card data marked as compile-time placeholder. */
export function isPlaceholderHypothesis(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  return Boolean((data as { placeholder?: boolean }).placeholder);
}

/** Strategy id from a hypothesis node, if present. */
export function getHypothesisRefId(node: WorkspaceNode): string | undefined {
  if (node.type !== 'hypothesis') return undefined;
  const refId = (node.data as HypothesisNodeData).refId;
  return typeof refId === 'string' ? refId : undefined;
}
