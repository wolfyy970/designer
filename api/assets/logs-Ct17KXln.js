import { Hono } from "hono";
import { g as getTaskLogEntries, b as getTraceLogLines, c as getLogEntries, d as appendTraceLines, e as clearLogEntries } from "./log-store-BzjCnWkn.js";
import { p as parseRequestJson } from "./parse-request-BH7y8s49.js";
import { e as env } from "../[[...route]].js";
import { z } from "zod";
import "node:fs";
import "node:path";
import "@mariozechner/pi-coding-agent";
import "@hono/node-server/vercel";
import "hono/cors";
import "hono/body-limit";
import "dotenv";
const AGENTIC_PHASE = {
  BUILDING: "building",
  EVALUATING: "evaluating",
  REVISING: "revising",
  COMPLETE: "complete"
};
const AGENTIC_PHASE_WIRE_VALUES = [
  AGENTIC_PHASE.BUILDING,
  AGENTIC_PHASE.EVALUATING,
  AGENTIC_PHASE.REVISING,
  AGENTIC_PHASE.COMPLETE
];
const agenticPhaseZodSchema = z.enum(AGENTIC_PHASE_WIRE_VALUES);
const runTraceKindSchema = z.enum([
  "run_started",
  "phase",
  "model_turn_start",
  "model_first_token",
  "tool_started",
  "tool_finished",
  "tool_failed",
  "files_planned",
  "file_written",
  "evaluation_progress",
  "evaluation_worker",
  "evaluation_report",
  "revision_round",
  "checkpoint",
  "compaction",
  "skills_loaded",
  "skill_activated"
]);
const runTraceEventSchema = z.object({
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
  status: z.enum(["info", "success", "warning", "error"]).optional(),
  detail: z.string().optional(),
  /** JSON snapshot of tool call arguments (server-truncated). */
  toolArgs: z.string().optional(),
  /** Truncated tool result body for observability (matches `detail` on tool_finished when set). */
  toolResult: z.string().optional()
});
const runTraceEventIngestSchema = runTraceEventSchema.passthrough();
const PostTraceBodySchema = z.object({
  correlationId: z.string().optional(),
  resultId: z.string().optional(),
  events: z.array(runTraceEventIngestSchema)
});
const logs = new Hono();
logs.get("/", (c) => {
  if (!env.isDev) {
    return c.body(null, 404);
  }
  return c.json({
    llm: getLogEntries(),
    trace: getTraceLogLines(),
    task: getTaskLogEntries()
  });
});
logs.post("/trace", async (c) => {
  if (!env.isDev) {
    return c.body(null, 404);
  }
  const parsed = await parseRequestJson(c, PostTraceBodySchema);
  if (!parsed.ok) return parsed.response;
  const { correlationId, resultId, events } = parsed.data;
  appendTraceLines(
    events.map((event) => ({
      event,
      correlationId,
      resultId
    }))
  );
  return c.json({ ok: true });
});
logs.delete("/", (c) => {
  if (!env.isDev) {
    return c.body(null, 404);
  }
  clearLogEntries();
  return c.body(null, 204);
});
export {
  PostTraceBodySchema,
  runTraceEventIngestSchema as RunTraceEventBodySchema,
  logs as default
};
