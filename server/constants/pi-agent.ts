/** Pi agent context window: messages kept verbatim after compaction. */
export const PI_AGENT_CONTEXT_WINDOW = {
  KEEP_RECENT: 20,
  COMPACT_THRESHOLD: 30,
} as const;

/** `phase` on LLM log rows for Pi `streamSimple` turns (see makeLoggedPiStreamFn). */
export const PI_LLM_LOG_PHASE = {
  AGENTIC_TURN: 'agentic_turn',
  REVISION: 'revision',
} as const;
