/**
 * Runtime validation for generate/hypothesis SSE payloads before callbacks run.
 * SSE `event:` line is authoritative for `type` (body `type` is ignored if present).
 *
 * {@link GenerateSSEEvent} is `z.infer<typeof generateSSEEventSchema>` (re-exported from `src/api/types.ts`).
 */
import { z } from 'zod';
import { evaluatorRubricIdZodSchema } from './evaluator-rubric-zod';
import { SSE_EVENT_NAMES } from '../constants/sse-events';
import { agenticPhaseZodSchema } from '../constants/agentic-stream';
import { runTraceEventSchema as canonicalRunTraceEventSchema } from './run-trace-event-schema';

/** Trace payload: canonical shape + passthrough for forward-compatible server fields. */
const traceSSESchema = canonicalRunTraceEventSchema.passthrough();

const todoItemSchema = z.object({
  id: z.string(),
  task: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

const evalCriterionScoreSchema = z.object({
  score: z.number(),
  notes: z.string(),
});

const evalFindingSchema = z.object({
  severity: z.enum(['high', 'medium', 'low']),
  summary: z.string(),
  detail: z.string(),
});

const evalHardFailSchema = z.object({
  code: z.string(),
  message: z.string(),
});

/** Matches {@link import('../types/evaluation').EvaluatorWorkerReport} for SSE wire validation. */
const evaluatorWorkerReportSSESchema = z
  .object({
    rubric: evaluatorRubricIdZodSchema,
    scores: z.record(z.string(), evalCriterionScoreSchema),
    findings: z.array(evalFindingSchema),
    hardFails: z.array(evalHardFailSchema),
    rawTrace: z.string().optional(),
    playwrightSkipped: z
      .object({
        reason: z.enum(['browser_unavailable', 'eval_error']),
        message: z.string(),
      })
      .optional(),
    artifacts: z
      .object({
        browserScreenshot: z
          .object({
            mediaType: z.enum(['image/jpeg', 'image/png']),
            base64: z.string(),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

const aggregatedHardFailSSESchema = z.object({
  code: z.string(),
  message: z.string(),
  source: evaluatorRubricIdZodSchema,
});

const aggregatedEvaluationReportSSESchema = z
  .object({
    overallScore: z.number(),
    normalizedScores: z.record(z.string(), z.number()),
    hardFails: z.array(aggregatedHardFailSSESchema),
    prioritizedFixes: z.array(z.string()),
    shouldRevise: z.boolean(),
    revisionBrief: z.string(),
    evaluatorTraces: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

/** Matches {@link import('../types/evaluation').EvaluationRoundSnapshot} for SSE. */
const evaluationRoundSnapshotSSESchema = z
  .object({
    round: z.number(),
    files: z.record(z.string(), z.string()).optional(),
    design: evaluatorWorkerReportSSESchema.optional(),
    strategy: evaluatorWorkerReportSSESchema.optional(),
    implementation: evaluatorWorkerReportSSESchema.optional(),
    browser: evaluatorWorkerReportSSESchema.optional(),
    aggregate: aggregatedEvaluationReportSSESchema,
  })
  .passthrough();

const agenticStopReasonSchema = z.enum([
  'satisfied',
  'max_revisions',
  'aborted',
  'revision_failed',
  'build_only',
]);

/** Matches {@link import('../types/evaluation').AgenticCheckpoint} for SSE. */
const agenticCheckpointSSESchema = z
  .object({
    totalRounds: z.number(),
    filesWritten: z.array(z.string()),
    finalTodosSummary: z.string(),
    revisionBriefApplied: z.string().optional(),
    completedAt: z.string(),
    stopReason: agenticStopReasonSchema.optional(),
    revisionAttempts: z.number().optional(),
  })
  .passthrough();

/**
 * Validates SSE JSON merged with the wire event name. Nested evaluation/checkpoint
 * payloads use loose object schemas (required keys + passthrough).
 */
export const generateSSEEventSchema = z.union([
  z.object({ type: z.literal(SSE_EVENT_NAMES.progress), status: z.string() }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.activity), entry: z.string() }),
  z.object({
    type: z.literal(SSE_EVENT_NAMES.thinking),
    delta: z.string(),
    turnId: z.number(),
  }),
  z.object({
    type: z.literal(SSE_EVENT_NAMES.streaming_tool),
    toolName: z.string(),
    streamedChars: z.number(),
    done: z.boolean(),
    toolPath: z.string().optional(),
  }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.trace), trace: traceSSESchema }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.code), code: z.string() }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.error), error: z.string() }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.file), path: z.string(), content: z.string() }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.plan), files: z.array(z.string()) }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.todos), todos: z.array(todoItemSchema) }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.phase), phase: agenticPhaseZodSchema }),
  z.object({
    type: z.literal(SSE_EVENT_NAMES.evaluation_progress),
    round: z.number(),
    phase: z.string(),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal(SSE_EVENT_NAMES.evaluation_worker_done),
    round: z.number(),
    rubric: evaluatorRubricIdZodSchema,
    report: evaluatorWorkerReportSSESchema,
  }),
  z.object({
    type: z.literal(SSE_EVENT_NAMES.evaluation_report),
    round: z.number(),
    snapshot: evaluationRoundSnapshotSSESchema,
  }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.revision_round), round: z.number(), brief: z.string() }),
  z.object({
    type: z.literal(SSE_EVENT_NAMES.skills_loaded),
    skills: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        description: z.string(),
      }),
    ),
  }),
  z.object({
    type: z.literal(SSE_EVENT_NAMES.skill_activated),
    key: z.string(),
    name: z.string(),
    description: z.string(),
  }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.checkpoint), checkpoint: agenticCheckpointSSESchema }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.lane_done), laneIndex: z.number() }),
  z.object({ type: z.literal(SSE_EVENT_NAMES.done) }),
]);

/** Parsed SSE event shape — single source of truth with {@link generateSSEEventSchema}. */
export type GenerateSSEEvent = z.infer<typeof generateSSEEventSchema>;

/** Drop `type` from body so the SSE event line always wins. */
function mergeSseEventPayload(
  eventName: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const rest = { ...data };
  delete rest.type;
  return { ...rest, type: eventName };
}

export function safeParseGenerateSSEEvent(
  eventName: string,
  data: Record<string, unknown>,
): { ok: true; event: GenerateSSEEvent } | { ok: false; error: z.ZodError } {
  const nameResult = z.string().min(1).safeParse(eventName.trim());
  if (!nameResult.success) {
    return { ok: false, error: nameResult.error };
  }
  const merged = mergeSseEventPayload(eventName, data);
  const parsed = generateSSEEventSchema.safeParse(merged);
  if (!parsed.success) {
    return { ok: false, error: parsed.error };
  }
  return { ok: true, event: parsed.data };
}
