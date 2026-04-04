/** Canvas node type string literals — single source of truth */
export const NODE_TYPES = {
  DESIGN_BRIEF: 'designBrief',
  EXISTING_DESIGN: 'existingDesign',
  RESEARCH_CONTEXT: 'researchContext',
  OBJECTIVES_METRICS: 'objectivesMetrics',
  DESIGN_CONSTRAINTS: 'designConstraints',
  DESIGN_SYSTEM: 'designSystem',
  COMPILER: 'compiler',
  HYPOTHESIS: 'hypothesis',
  VARIANT: 'variant',
  MODEL: 'model',
} as const;

export type NodeType = (typeof NODE_TYPES)[keyof typeof NODE_TYPES];

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

/** DimensionMap.compilerModel when prompts are built from a hypothesis workspace slice (not incubator compile). */
export const HYPOTHESIS_COMPILER_MODEL = 'merged' as const;

/** Fallback `pinnedRunId` on variant nodes when forking before any completed generation exists. */
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

/** React Flow layer: variant actively generating stays above overlapping nodes */
export const VARIANT_NODE_GENERATING_Z_INDEX = 1000;
