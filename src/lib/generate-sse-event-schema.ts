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

/** Trace envelope: required fields + passthrough for optional RunTraceEvent keys. */
const runTraceEventSchema = z
  .object({
    id: z.string(),
    at: z.string(),
    kind: z.string(),
    label: z.string(),
  })
  .passthrough();

const todoItemSchema = z.object({
  id: z.string(),
  task: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

/** Minimum envelope for `evaluation_report.snapshot`; extra fields preserved via passthrough. */
const evaluationReportSnapshotSchema = z
  .object({
    round: z.number(),
  })
  .passthrough();

/** Minimum envelope for `checkpoint` SSE payloads. */
const agenticCheckpointSchema = z
  .object({
    totalRounds: z.number(),
    completedAt: z.string(),
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
  z.object({ type: z.literal(SSE_EVENT_NAMES.trace), trace: runTraceEventSchema }),
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
    report: z
      .object({
        rubric: evaluatorRubricIdZodSchema,
      })
      .passthrough(),
  }),
  z.object({
    type: z.literal(SSE_EVENT_NAMES.evaluation_report),
    round: z.number(),
    snapshot: evaluationReportSnapshotSchema,
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
  z.object({ type: z.literal(SSE_EVENT_NAMES.checkpoint), checkpoint: agenticCheckpointSchema }),
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
