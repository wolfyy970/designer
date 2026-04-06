/**
 * Wire names for generate / hypothesis SSE `event:` lines.
 * Server writers, client parser, and Zod should reference these — not ad-hoc strings.
 */
export const SSE_EVENT_NAMES = {
  progress: 'progress',
  activity: 'activity',
  thinking: 'thinking',
  streaming_tool: 'streaming_tool',
  trace: 'trace',
  code: 'code',
  error: 'error',
  file: 'file',
  plan: 'plan',
  todos: 'todos',
  phase: 'phase',
  evaluation_progress: 'evaluation_progress',
  evaluation_worker_done: 'evaluation_worker_done',
  evaluation_report: 'evaluation_report',
  revision_round: 'revision_round',
  skills_loaded: 'skills_loaded',
  skill_activated: 'skill_activated',
  checkpoint: 'checkpoint',
  lane_done: 'lane_done',
  done: 'done',
  /** POST /api/incubate final incubation plan (after streaming deltas). */
  incubate_result: 'incubate_result',
} as const;
