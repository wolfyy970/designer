/**
 * Runtime validation for generate/hypothesis SSE payloads before callbacks run.
 * SSE `event:` line is authoritative for `type` (body `type` is ignored if present).
 */
import { z } from 'zod';
import type { GenerateSSEEvent } from '../api/types';

const agenticPhaseSchema = z.enum(['building', 'evaluating', 'revising', 'complete']);

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
  z.object({ type: z.literal('progress'), status: z.string() }),
  z.object({ type: z.literal('activity'), entry: z.string() }),
  z.object({
    type: z.literal('thinking'),
    delta: z.string(),
    turnId: z.number(),
  }),
  z.object({ type: z.literal('trace'), trace: runTraceEventSchema }),
  z.object({ type: z.literal('code'), code: z.string() }),
  z.object({ type: z.literal('error'), error: z.string() }),
  z.object({ type: z.literal('file'), path: z.string(), content: z.string() }),
  z.object({ type: z.literal('plan'), files: z.array(z.string()) }),
  z.object({ type: z.literal('todos'), todos: z.array(todoItemSchema) }),
  z.object({ type: z.literal('phase'), phase: agenticPhaseSchema }),
  z.object({
    type: z.literal('evaluation_progress'),
    round: z.number(),
    phase: z.string(),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal('evaluation_report'),
    round: z.number(),
    snapshot: evaluationReportSnapshotSchema,
  }),
  z.object({ type: z.literal('revision_round'), round: z.number(), brief: z.string() }),
  z.object({ type: z.literal('checkpoint'), checkpoint: agenticCheckpointSchema }),
  z.object({ type: z.literal('lane_done'), laneIndex: z.number() }),
  z.object({ type: z.literal('done') }),
]);

/** Drop `type` from body so the SSE event line always wins. */
export function mergeSseEventPayload(
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
  return { ok: true, event: parsed.data as GenerateSSEEvent };
}
