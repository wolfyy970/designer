/** Canvas node type string literals — single source of truth */
export const NODE_TYPES = {
  DESIGN_BRIEF: 'designBrief',
  EXISTING_DESIGN: 'existingDesign',
  RESEARCH_CONTEXT: 'researchContext',
  OBJECTIVES_METRICS: 'objectivesMetrics',
  DESIGN_CONSTRAINTS: 'designConstraints',
  DESIGN_SYSTEM: 'designSystem',
  INCUBATOR: 'incubator',
  HYPOTHESIS: 'hypothesis',
  PREVIEW: 'preview',
  MODEL: 'model',
} as const;

export type NodeType = (typeof NODE_TYPES)[keyof typeof NODE_TYPES];

/**
 * Input node types (spec facets → incubator).
 * Single source of truth — use everywhere instead of duplicating the set.
 */
export const INPUT_NODE_TYPES = new Set<string>([
  NODE_TYPES.DESIGN_BRIEF,
  NODE_TYPES.EXISTING_DESIGN,
  NODE_TYPES.RESEARCH_CONTEXT,
  NODE_TYPES.OBJECTIVES_METRICS,
  NODE_TYPES.DESIGN_CONSTRAINTS,
]);

/** Edge type string literals */
export const EDGE_TYPES = {
  DATA_FLOW: 'dataFlow',
} as const;

export type EdgeType = (typeof EDGE_TYPES)[keyof typeof EDGE_TYPES];

/** Edge data-flow status values */
export const EDGE_STATUS = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  COMPLETE: 'complete',
  ERROR: 'error',
} as const;

export type EdgeStatus = (typeof EDGE_STATUS)[keyof typeof EDGE_STATUS];

/** IncubationPlan.incubatorModel when prompts are built from a hypothesis workspace slice (not POST /incubate). */
export const HYPOTHESIS_INCUBATOR_MODEL = 'merged' as const;

/** Fallback `pinnedRunId` on preview nodes when forking before any completed generation exists. */
export const UNKNOWN_PINNED_RUN_ID = 'unknown' as const;

/** Node border/fill status values (drives NodeShell visual state) */
export const NODE_STATUS = {
  SELECTED: 'selected',
  PROCESSING: 'processing',
  ERROR: 'error',
  DIMMED: 'dimmed',
  FILLED: 'filled',
  EMPTY: 'empty',
} as const;

export type NodeStatus = (typeof NODE_STATUS)[keyof typeof NODE_STATUS];

/** Edge ID convention — single builder so renaming the format is one-line */
export function buildEdgeId(source: string, target: string): string {
  return `edge-${source}-to-${target}`;
}

/** React Flow layer: preview node actively generating stays above overlapping nodes */
export const PREVIEW_NODE_GENERATING_Z_INDEX = 1000;

/** React Flow: interactive controls inside nodes — avoid drag/WheelCapture hijack */
export const RF_INTERACTIVE = 'nodrag nowheel';
/** Like {@link RF_INTERACTIVE} plus block canvas pan on nested interactions */
export const RF_INTERACTIVE_NOPAN = 'nodrag nowheel nopan';
/** Edge delete / small controls: block node drag and canvas pan */
export const RF_NODRAG_NOPAN = 'nodrag nopan';

/** Pulse dot used next to streaming-tool rows in the Timeline. */
export const TIMELINE_DOT =
  'inline-flex h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent';
