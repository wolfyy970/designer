import { z } from 'zod';
import { agenticPhaseZodSchema } from '../constants/agentic-stream';

/** Mirrors `RunTraceKind` in `types/provider.ts` for log payload validation. */
const runTraceKindSchema = z.enum([
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

export const runTraceEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  kind: runTraceKindSchema,
  label: z.string(),
  phase: agenticPhaseZodSchema.optional(),
  round: z.number().optional(),
  toolName: z.string().optional(),
  path: z.string().optional(),
  status: z.enum(['info', 'success', 'warning', 'error']).optional(),
  detail: z.string().optional(),
});
