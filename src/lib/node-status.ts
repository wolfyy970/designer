import { NODE_STATUS, type NodeStatus } from '../constants/canvas';

/** Simple filled/empty status based on whether the node has content. */
export function filledOrEmpty(hasContent: boolean): NodeStatus {
  return hasContent ? NODE_STATUS.FILLED : NODE_STATUS.EMPTY;
}

/** Processing → filled status for nodes that run an async operation. */
export function processingOrFilled(isProcessing: boolean): NodeStatus {
  return isProcessing ? NODE_STATUS.PROCESSING : NODE_STATUS.FILLED;
}

/**
 * Preview node visual status: archival, error, generating, filled, and empty.
 * Matches the ring/border progression in the preview card (`VariantNode.tsx`).
 */
export function previewNodeStatus(opts: {
  isArchived: boolean;
  isError: boolean;
  isGenerating: boolean;
  hasCode: boolean;
}): NodeStatus {
  if (opts.isArchived) return NODE_STATUS.DIMMED;
  if (opts.isError) return NODE_STATUS.ERROR;
  if (opts.isGenerating) return NODE_STATUS.PROCESSING;
  return opts.hasCode ? NODE_STATUS.FILLED : NODE_STATUS.EMPTY;
}
