/**
 * Type-narrowing accessors for workspace node `data` — prefer over bare `as` casts.
 */
import { NODE_TYPES } from '../constants/canvas';
import type { DesignSystemNodeData, HypothesisNodeData, ModelNodeData, PreviewNodeData } from '../types/canvas-data';
import type { WorkspaceNode } from '../types/workspace-graph';

export function getModelNodeData(node: WorkspaceNode | undefined): ModelNodeData | undefined {
  if (!node || node.type !== NODE_TYPES.MODEL) return undefined;
  return node.data as ModelNodeData;
}

export function getDesignSystemNodeData(
  node: WorkspaceNode | undefined,
): DesignSystemNodeData | undefined {
  if (!node || node.type !== NODE_TYPES.DESIGN_SYSTEM) return undefined;
  return node.data as DesignSystemNodeData;
}

export function getPreviewNodeData(node: WorkspaceNode | undefined): PreviewNodeData | undefined {
  if (!node || node.type !== NODE_TYPES.PREVIEW) return undefined;
  return node.data as PreviewNodeData;
}

export function getHypothesisNodeData(
  node: WorkspaceNode | undefined,
): HypothesisNodeData | undefined {
  if (!node || node.type !== NODE_TYPES.HYPOTHESIS) return undefined;
  return node.data as HypothesisNodeData;
}
