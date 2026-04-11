/**
 * Server ingest validation for POST /api/logs/trace — aligned with `runTraceEventSchema` (client).
 */
import { z } from 'zod';
import { runTraceEventSchema } from '../../src/lib/run-trace-event-schema.ts';

/** Dev trace POST allows extra fields from producers (passthrough). */
export const runTraceEventIngestSchema = runTraceEventSchema.passthrough();

export const PostTraceBodySchema = z.object({
  correlationId: z.string().optional(),
  resultId: z.string().optional(),
  events: z.array(runTraceEventIngestSchema),
});
