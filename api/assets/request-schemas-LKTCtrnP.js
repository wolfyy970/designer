import { streamSSE } from "hono/streaming";
import { r as resolveThinkingConfig, b as ThinkingOverrideSchema, D as DesignSpecSchema } from "./thinking-defaults-BkNuccwq.js";
import { e as env } from "../[[...route]].js";
import { S as SSE_EVENT_NAMES, n as normalizeProviderError, g as acquireAgenticSlotOrReject, i as releaseAgenticSlot, d as buildAgenticSystemContext, e as emitSkillsLoadedEvents, f as runDesignAgentSession, j as agenticOrchestratorEventToSse, k as HypothesisStrategySchema } from "./hypothesis-request-schemas-C0hkg4kC.js";
import { c as createWriteGate } from "./sse-write-gate-9e2bc412.js";
import { n as normalizeError } from "./registry-B7is6TUr.js";
import { w as writeObservabilityLine, O as OBSERVABILITY_SCHEMA_VERSION, l as appendTaskRunLogEntry, m as appendTaskResultLogEntry } from "./log-store-BzjCnWkn.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
async function runTaskAgentSseBody(stream, handler) {
  let seq = 0;
  const allocId = () => String(seq++);
  const gate = createWriteGate();
  const sseWriteAudit = env.isDev ? { byType: {}, t0: Date.now() } : null;
  const write = async (event, data) => {
    if (sseWriteAudit) sseWriteAudit.byType[event] = (sseWriteAudit.byType[event] ?? 0) + 1;
    const payload = JSON.stringify(data);
    await gate.enqueue(async () => {
      await stream.writeSSE({ data: payload, event, id: allocId() });
    });
  };
  try {
    await handler({ write, allocId, gate });
    await write(SSE_EVENT_NAMES.phase, { phase: "complete" });
    await write(SSE_EVENT_NAMES.done, {});
  } catch (err) {
    await write(SSE_EVENT_NAMES.error, { error: normalizeProviderError(err) });
    await write(SSE_EVENT_NAMES.done, {});
  }
  if (sseWriteAudit) {
    console.debug("(task:SSE) write summary", {
      byType: sseWriteAudit.byType,
      durationMs: Date.now() - sseWriteAudit.t0
    });
  }
}
function resolveTaskAgentResultFile(input) {
  const expectedContent = input.files[input.resultFile];
  if (expectedContent != null) {
    return { result: expectedContent, resultFile: input.resultFile };
  }
  if (input.fallback === "strict") return void 0;
  const firstFile = Object.entries(input.files).find(
    ([, content]) => content.trim().length > 0
  );
  if (!firstFile) return void 0;
  const [resultFile, result] = firstFile;
  return { result, resultFile };
}
async function writeTaskRunDiskLog(input) {
  const root = path.join(input.baseDir, "task-runs", input.correlationId);
  await mkdir(root, { recursive: true });
  const meta = {
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    providerId: input.providerId,
    modelId: input.modelId,
    durationMs: input.durationMs,
    outcome: input.outcome,
    resultFile: input.resultFile,
    sandboxFileCount: input.sandboxFilePaths.length,
    errorMessage: input.errorMessage
  };
  await writeFile(path.join(root, "meta.json"), `${JSON.stringify(meta, null, 2)}
`, "utf8");
  await writeFile(path.join(root, "user-prompt.txt"), input.userPrompt, "utf8");
  await writeFile(path.join(root, "result.json"), input.resultContent, "utf8");
  await writeFile(
    path.join(root, "skills.json"),
    `${JSON.stringify({ keys: input.skillKeys }, null, 2)}
`,
    "utf8"
  );
}
function emitTaskResultLine(input) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts,
    type: "task_result",
    payload: {
      sessionType: input.sessionType,
      correlationId: input.correlationId,
      resultFile: input.resultFile,
      resultContent: input.resultContent,
      sandboxFilePaths: Object.keys(input.files)
    }
  });
  appendTaskResultLogEntry({
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    resultFile: input.resultFile,
    resultContent: input.resultContent,
    sandboxFilePaths: Object.keys(input.files)
  });
  if (env.isDev) {
    console.debug("[task-agent] result extracted", {
      sessionType: input.sessionType,
      correlationId: input.correlationId,
      resultFile: input.resultFile,
      resultChars: input.resultContent.length,
      sandboxFileCount: Object.keys(input.files).length
    });
  }
}
function emitTaskRunLine(input) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts,
    type: "task_run",
    payload: {
      sessionType: input.sessionType,
      correlationId: input.correlationId,
      providerId: input.providerId,
      modelId: input.modelId,
      durationMs: input.durationMs,
      outcome: input.outcome,
      resultFile: input.resultFile,
      sandboxFileCount: input.sandboxFileCount,
      errorMessage: input.errorMessage,
      thinking: input.thinking
    }
  });
  appendTaskRunLogEntry({
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    providerId: input.providerId,
    modelId: input.modelId,
    durationMs: input.durationMs,
    outcome: input.outcome,
    resultFile: input.resultFile,
    sandboxFileCount: input.sandboxFileCount,
    errorMessage: input.errorMessage,
    thinking: input.thinking
  });
  if (env.isDev) {
    console.debug("[task-agent] task_run summary", {
      ...input,
      ts
    });
  }
}
function writeSuccessfulTaskRunDiskLog(input) {
  if (!input.baseDir) return;
  void writeTaskRunDiskLog({
    baseDir: input.baseDir,
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    providerId: input.providerId,
    modelId: input.modelId,
    userPrompt: input.userPrompt,
    resultFile: input.resultFile,
    resultContent: input.resultContent,
    sandboxFilePaths: input.sandboxFilePaths,
    skillKeys: input.skillKeys,
    durationMs: input.durationMs,
    outcome: "success"
  }).catch((err) => {
    if (env.isDev) console.error("[task-agent] writeTaskRunDiskLog failed", err);
  });
}
async function acquireTaskAgentSlot() {
  return acquireAgenticSlotOrReject();
}
function releaseTaskAgentSlot() {
  releaseAgenticSlot();
}
async function runTaskAgentPiSession(input, forward) {
  const ctx = await buildAgenticSystemContext({ sessionType: input.sessionType });
  await emitSkillsLoadedEvents(forward, ctx.loadedSkills, "building");
  const sessionResult = await runDesignAgentSession(
    {
      userPrompt: input.userPrompt,
      providerId: input.providerId,
      modelId: input.modelId,
      thinkingLevel: input.thinking?.level,
      signal: input.signal,
      correlationId: input.correlationId,
      sessionType: input.sessionType,
      systemPrompt: ctx.systemPrompt,
      skillCatalog: ctx.skillCatalog,
      seedFiles: ctx.sandboxSeedFiles,
      initialProgressMessage: input.initialProgressMessage ?? "Starting task…"
    },
    (event) => forward(event)
  );
  return {
    sessionResult,
    skillKeys: ctx.loadedSkills.map((skill) => skill.key)
  };
}
class TaskAgentExecutionError extends Error {
  outcome;
  constructor(message, outcome = "error") {
    super(message);
    this.name = "TaskAgentExecutionError";
    this.outcome = outcome;
  }
}
async function executeTaskAgentStream(stream, input, options) {
  const startedAt = Date.now();
  const correlationId = input.correlationId ?? crypto.randomUUID();
  let outcome = "error";
  let errorMessage;
  let resultFileUsed;
  let sandboxFileCount = 0;
  const gate = options.writeGate ?? createWriteGate();
  const write = async (event, data) => {
    const payload = JSON.stringify(data);
    await gate.enqueue(async () => {
      await stream.writeSSE({ data: payload, event, id: options.allocId() });
    });
  };
  const writeEvent = async (event) => {
    if (input.signal?.aborted) return;
    const { sseEvent, data } = agenticOrchestratorEventToSse(event);
    await write(sseEvent, data);
  };
  const acquired = await acquireTaskAgentSlot();
  if (!acquired) {
    errorMessage = "Too many agentic runs are active. Please wait and try again.";
    emitTaskRunLine({
      sessionType: input.sessionType,
      correlationId,
      providerId: input.providerId,
      modelId: input.modelId,
      durationMs: Date.now() - startedAt,
      outcome: "error",
      sandboxFileCount: 0,
      errorMessage,
      thinking: input.thinking
    });
    throw new TaskAgentExecutionError(errorMessage, "error");
  }
  try {
    await write(SSE_EVENT_NAMES.phase, { phase: "building" });
    const { sessionResult, skillKeys } = await runTaskAgentPiSession(
      {
        userPrompt: input.userPrompt,
        providerId: input.providerId,
        modelId: input.modelId,
        sessionType: input.sessionType,
        thinking: input.thinking,
        signal: input.signal,
        correlationId,
        initialProgressMessage: input.initialProgressMessage
      },
      writeEvent
    );
    if (!sessionResult) {
      errorMessage = "Agent session completed without result.";
      throw new TaskAgentExecutionError(errorMessage, "no_result");
    }
    sandboxFileCount = Object.keys(sessionResult.files).length;
    const resultFile = input.resultFile ?? "result.json";
    resultFileUsed = resultFile;
    const resolved = resolveTaskAgentResultFile({
      files: sessionResult.files,
      resultFile,
      fallback: input.resultFileFallback ?? "firstNonEmptyFile"
    });
    if (resolved) {
      outcome = "success";
      resultFileUsed = resolved.resultFile;
      emitTaskResultLine({
        sessionType: input.sessionType,
        correlationId,
        resultFile: resolved.resultFile,
        resultContent: resolved.result,
        files: sessionResult.files
      });
      writeSuccessfulTaskRunDiskLog({
        baseDir: env.OBSERVABILITY_LOG_BASE_DIR,
        correlationId,
        sessionType: input.sessionType,
        providerId: input.providerId,
        modelId: input.modelId,
        userPrompt: input.userPrompt,
        resultFile: resolved.resultFile,
        resultContent: resolved.result,
        sandboxFilePaths: Object.keys(sessionResult.files),
        skillKeys,
        durationMs: Date.now() - startedAt
      });
      return { result: resolved.result, resultFile: resolved.resultFile, files: sessionResult.files };
    }
    outcome = "no_result";
    errorMessage = `Agent did not write the expected result file (${resultFile}).`;
    throw new TaskAgentExecutionError(errorMessage, "no_result");
  } catch (err) {
    errorMessage = normalizeError(err);
    if (err instanceof TaskAgentExecutionError) {
      outcome = err.outcome;
    } else {
      outcome = "error";
    }
    throw err;
  } finally {
    emitTaskRunLine({
      sessionType: input.sessionType,
      correlationId,
      providerId: input.providerId,
      modelId: input.modelId,
      durationMs: Date.now() - startedAt,
      outcome,
      resultFile: resultFileUsed,
      sandboxFileCount,
      errorMessage: outcome !== "success" ? errorMessage : void 0,
      thinking: input.thinking
    });
    releaseTaskAgentSlot();
  }
}
function runTaskAgentRoute(c, options) {
  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    const correlationId = crypto.randomUUID();
    if (env.isDev) {
      console.debug(`[${options.routeLabel}] request`, {
        correlationId,
        providerId: options.body.providerId,
        modelId: options.body.modelId,
        ...options.debugPayload?.(options.body)
      });
    }
    await runTaskAgentSseBody(stream, async ({ write, allocId, gate }) => {
      const thinking = resolveThinkingConfig(
        options.thinkingTask,
        options.body.modelId,
        options.body.thinking
      );
      const taskResult = await executeTaskAgentStream(
        stream,
        {
          userPrompt: options.userPrompt,
          providerId: options.body.providerId,
          modelId: options.body.modelId,
          sessionType: options.sessionType,
          thinking,
          signal: abortSignal,
          correlationId,
          resultFile: options.resultFile,
          resultFileFallback: options.resultFileFallback ?? "firstNonEmptyFile",
          initialProgressMessage: options.initialProgressMessage
        },
        { allocId, writeGate: gate }
      );
      await options.onTaskResult(taskResult, { write, correlationId });
    });
  });
}
const DesignSystemExtractRequestSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  sourceHash: z.string().optional(),
  images: z.array(
    z.object({
      dataUrl: z.string(),
      mimeType: z.string().optional(),
      name: z.string().optional(),
      filename: z.string().optional(),
      description: z.string().optional()
    }).passthrough()
  ).optional(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  thinking: ThinkingOverrideSchema.optional()
}).refine((body) => Boolean(body.content?.trim()) || Boolean(body.images?.length), {
  message: "Provide design-system text, reference images, or both."
});
const InternalContextGenerateRequestSchema = z.object({
  spec: DesignSpecSchema,
  sourceHash: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  thinking: ThinkingOverrideSchema.optional()
});
const InputsGenerateTargetSchema = z.enum([
  "research-context",
  "objectives-metrics",
  "design-constraints"
]);
const InputsGenerateRequestSchema = z.object({
  inputId: InputsGenerateTargetSchema,
  designBrief: z.string().min(1),
  existingDesign: z.string().optional(),
  researchContext: z.string().optional(),
  objectivesMetrics: z.string().optional(),
  designConstraints: z.string().optional(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  thinking: ThinkingOverrideSchema.optional()
});
const IncubatorPromptOptionsSchema = z.object({
  count: z.number().int().positive().optional(),
  existingStrategies: z.array(HypothesisStrategySchema).optional(),
  internalContextDocument: z.string().optional(),
  designSystemDocuments: z.array(z.object({ nodeId: z.string(), title: z.string(), content: z.string() })).optional()
});
const IncubateRequestSchema = z.object({
  spec: DesignSpecSchema,
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  referenceDesigns: z.array(
    z.object({
      name: z.string(),
      code: z.string()
    })
  ).optional(),
  supportsVision: z.boolean().optional(),
  internalContextDocument: z.string().optional(),
  designSystemDocuments: z.array(z.object({ nodeId: z.string(), title: z.string(), content: z.string() })).optional(),
  promptOptions: IncubatorPromptOptionsSchema.optional(),
  thinking: ThinkingOverrideSchema.optional()
});
export {
  DesignSystemExtractRequestSchema as D,
  IncubateRequestSchema as I,
  InputsGenerateRequestSchema as a,
  InternalContextGenerateRequestSchema as b,
  runTaskAgentRoute as r
};
