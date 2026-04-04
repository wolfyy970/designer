import type { WorkspaceNode } from '../types/workspace-graph';
import { getHypothesisNodeData } from './canvas-node-data';

/** Runtime check for hypothesis card data marked as compile-time placeholder. */
export function isPlaceholderHypothesis(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  return Boolean((data as { placeholder?: boolean }).placeholder);
}

/** Strategy id from a hypothesis node, if present. */
export function getHypothesisRefId(node: WorkspaceNode): string | undefined {
  const refId = getHypothesisNodeData(node)?.refId;
  return typeof refId === 'string' ? refId : undefined;
}
