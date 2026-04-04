/**
 * Framework-neutral workspace graph model.
 *
 * React Flow (or any future canvas renderer) should adapt to/from these shapes;
 * persisted canvas state uses this contract rather than @xyflow/react types.
 */
import type { SpecSectionId } from './spec';
import type { EdgeStatus } from '../constants/canvas';

export type CanvasNodeType =
  | 'designBrief'
  | 'existingDesign'
  | 'researchContext'
  | 'objectivesMetrics'
  | 'designConstraints'
  | 'designSystem'
  | 'compiler'
  | 'hypothesis'
  | 'variant'
  | 'model';

export type CanvasNodeData = Record<string, unknown> & {
  refId?: string;
  variantStrategyId?: string;
};

/** Node in the experiment graph — no dependency on a specific renderer library. */
export interface WorkspaceNode {
  id: string;
  type: CanvasNodeType;
  position: { x: number; y: number };
  data: CanvasNodeData;
  /** Filled by the renderer when dimensions are known (e.g. React Flow `measured`). */
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
}

export interface WorkspaceEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  data: { status: EdgeStatus };
}

export interface WorkspaceViewport {
  x: number;
  y: number;
  zoom: number;
}

/** Map canvas node types to their spec section IDs */
export const NODE_TYPE_TO_SECTION: Partial<Record<CanvasNodeType, SpecSectionId>> = {
  designBrief: 'design-brief',
  existingDesign: 'existing-design',
  researchContext: 'research-context',
  objectivesMetrics: 'objectives-metrics',
  designConstraints: 'design-constraints',
};
