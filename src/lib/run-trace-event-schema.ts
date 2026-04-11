import { z } from 'zod';
import { agenticPhaseZodSchema } from '../constants/agentic-stream';

/** Single source of truth for trace kinds — use `RunTraceKind` / `RunTraceEvent` from `z.infer`. */
export const runTraceKindSchema = z.enum([
  'run_started',
  'phase',
  'model_turn_start',
  'model_first_token',
  'tool_started',
  'tool_finished',
  'tool_failed',
  'files_planned',
  'file_written',
  'evaluation_progress',
  'evaluation_worker',
  'evaluation_report',
  'revision_round',
  'checkpoint',
  'compaction',
  'skills_loaded',
  'skill_activated',
]);

export type RunTraceKind = z.infer<typeof runTraceKindSchema>;

export const runTraceEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: runTraceKindSchema,
  label: z.string(),
  /** PI model turn index (1-based), set on `model_turn_start` for timeline grouping */
  turnId: z.number().optional(),
  phase: agenticPhaseZodSchema.optional(),
  round: z.number().optional(),
  toolName: z.string().optional(),
  path: z.string().optional(),
  status: z.enum(['info', 'success', 'warning', 'error']).optional(),
  detail: z.string().optional(),
  /** JSON snapshot of tool call arguments (server-truncated). */
  toolArgs: z.string().optional(),
  /** Truncated tool result body for observability (matches `detail` on tool_finished when set). */
  toolResult: z.string().optional(),
});

/** Canonical run-trace shape for client validation and shared typing with `types/provider`. */
export type RunTraceEvent = z.infer<typeof runTraceEventSchema>;
