import type { GenerationMode } from '../constants/generation';
import type { ReferenceImage } from './spec';

// ── Per-node data interfaces ────────────────────────────────────────
// These provide type safety within node components, eliminating `as` casts.
// React Flow v12 requires node data to extend Record<string, unknown>,
// so each interface includes an index signature for compatibility.

/** Base constraint required by React Flow */
type NodeData<T> = Record<string, unknown> & T;

/** Section nodes (designBrief, existingDesign, etc.) store data in spec-store */
export type SectionNodeData = NodeData<Record<string, never>>;

/** Placeholder cards for optional sections not yet on the canvas */
export type SectionGhostTargetType =
  | 'existingDesign'
  | 'researchContext'
  | 'objectivesMetrics'
  | 'designConstraints';

const SECTION_GHOST_TARGET_TYPE_SET = new Set<string>([
  'existingDesign',
  'researchContext',
  'objectivesMetrics',
  'designConstraints',
]);

export function isSectionGhostTargetType(v: string): v is SectionGhostTargetType {
  return SECTION_GHOST_TARGET_TYPE_SET.has(v);
}

export type SectionGhostData = NodeData<{
  targetType: SectionGhostTargetType;
}>;

export type CompilerNodeData = NodeData<{
  hypothesisCount?: number;
}>;

export type HypothesisNodeData = NodeData<{
  refId?: string;
  placeholder?: boolean;
  providerId?: string;  // vestigial post-v13, kept for migration safety
  modelId?: string;     // vestigial post-v13
  agentMode?: GenerationMode;
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
  providerId?: string;
  modelId?: string;
}>;

export type ModelNodeData = NodeData<{
  title?: string;
  providerId?: string;
  modelId?: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
}>;
