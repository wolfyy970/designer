import type { ReferenceImage } from './spec';
import type { DesignMdDocument, ThinkingLevel } from './workspace-domain';

// ── Per-node data interfaces ────────────────────────────────────────
// These provide type safety within node components, eliminating `as` casts.
// React Flow v12 requires node data to extend Record<string, unknown>,
// so each interface includes an index signature for compatibility.

/** Base constraint required by React Flow */
type NodeData<T> = Record<string, unknown> & T;

/** Input nodes (designBrief, existingDesign, etc.) store data in spec-store */
export type InputNodeData = NodeData<Record<string, never>>;

/** Placeholder cards for optional input nodes not yet on the canvas */
export type InputGhostTargetType =
  | 'existingDesign'
  | 'researchContext'
  | 'objectivesMetrics'
  | 'designConstraints'
  | 'designSystem';

const INPUT_GHOST_TARGET_TYPE_SET = new Set<string>([
  'existingDesign',
  'researchContext',
  'objectivesMetrics',
  'designConstraints',
  'designSystem',
]);

export function isInputGhostTargetType(v: string): v is InputGhostTargetType {
  return INPUT_GHOST_TARGET_TYPE_SET.has(v);
}

export type InputGhostData = NodeData<{
  targetType: InputGhostTargetType;
}>;

export type IncubatorNodeData = NodeData<{
  hypothesisCount?: number;
}>;

export type HypothesisNodeData = NodeData<{
  refId?: string;
  placeholder?: boolean;
  providerId?: string;  // vestigial post-v13, kept for migration safety
  modelId?: string;     // vestigial post-v13
}>;

export type PreviewNodeData = NodeData<{
  refId?: string;
  strategyId?: string;
  pinnedRunId?: string;
}>;

export type DesignSystemNodeData = NodeData<{
  title?: string;
  content?: string;
  images?: ReferenceImage[];
  designMdDocument?: DesignMdDocument;
  providerId?: string;
  modelId?: string;
}>;

export type ModelNodeData = NodeData<{
  title?: string;
  providerId?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
}>;
