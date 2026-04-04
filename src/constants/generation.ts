/** Generation result status values — single source of truth */
export const GENERATION_STATUS = {
  PENDING: 'pending',
  GENERATING: 'generating',
  COMPLETE: 'complete',
  ERROR: 'error',
} as const;

export type GenerationStatus = (typeof GENERATION_STATUS)[keyof typeof GENERATION_STATUS];

/** Placeholder when pinning a variant run but no completed result supplies a run id. */
export const UNKNOWN_PINNED_RUN_ID = 'unknown' as const;
