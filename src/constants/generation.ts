/** All hypothesis runs use the agentic design pipeline (Pi, virtual FS, optional revision loop). */
export const GENERATION_MODE = {
  AGENTIC: 'agentic',
} as const;

export type GenerationMode = (typeof GENERATION_MODE)[keyof typeof GENERATION_MODE];

/** Generation result status values — single source of truth */
export const GENERATION_STATUS = {
  PENDING: 'pending',
  GENERATING: 'generating',
  COMPLETE: 'complete',
  ERROR: 'error',
} as const;

export type GenerationStatus = (typeof GENERATION_STATUS)[keyof typeof GENERATION_STATUS];
