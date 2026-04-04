/**
 * Type-narrowing accessors for workspace node `data` — prefer over bare `as` casts.
 */
import { NODE_TYPES } from '../constants/canvas';
import type {
  CompilerNodeData,
  DesignSystemNodeData,
  HypothesisNodeData,
  ModelNodeData,
  VariantNodeData,
} from '../types/canvas-data';
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

export function getVariantNodeData(node: WorkspaceNode | undefined): VariantNodeData | undefined {
  if (!node || node.type !== NODE_TYPES.VARIANT) return undefined;
  return node.data as VariantNodeData;
}

export function getHypothesisNodeData(
  node: WorkspaceNode | undefined,
): HypothesisNodeData | undefined {
  if (!node || node.type !== NODE_TYPES.HYPOTHESIS) return undefined;
  return node.data as HypothesisNodeData;
}

export function getCompilerNodeData(node: WorkspaceNode | undefined): CompilerNodeData | undefined {
  if (!node || node.type !== NODE_TYPES.COMPILER) return undefined;
  return node.data as CompilerNodeData;
}
