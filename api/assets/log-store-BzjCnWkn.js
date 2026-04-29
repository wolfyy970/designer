import { e as env } from "../[[...route]].js";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";
let debounceTimer = null;
const DEBOUNCE_MS = 500;
function scheduleAgentLogSnapshot() {
  if (!env.isDev || process.env.VITEST === "true") return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushAgentLogSnapshot();
  }, DEBOUNCE_MS);
}
function flushAgentLogSnapshotNow() {
  if (!env.isDev || process.env.VITEST === "true") return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  void flushAgentLogSnapshot();
}
async function flushAgentLogSnapshot() {
  try {
    const [{ getLogEntries: getLogEntries2, getTaskLogEntries: getTaskLogEntries2 }, { getTraceLogLines: getTraceLogLines2 }] = await Promise.all([
      Promise.resolve().then(() => logStore),
      Promise.resolve().then(() => traceLogStore)
    ]);
    const dir = path.join(process.cwd(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      note: "Mirror of dev GET /api/logs ({ llm, trace, task }). Regenerated when the log ring changes.",
      llm: getLogEntries2(),
      trace: getTraceLogLines2(),
      task: getTaskLogEntries2()
    };
    fs.writeFileSync(path.join(dir, "agent-snapshot.json"), `${JSON.stringify(payload, null, 2)}
`, "utf8");
  } catch (err) {
    if (env.isDev) console.warn("[agent-log-snapshot] write failed", err);
  }
}
const OBSERVABILITY_SCHEMA_VERSION = 1;
const sandbox = { "grepMaxLineLength": 500, "lsMaxEntries": 500, "findMaxResults": 1e3, "grepDefaultMatchLimit": 100, "bashToolMaxChars": 51200 };
const evaluator = { "fileMaxChars": 48e3, "bundleMaxChars": 64e3, "degradedMsgMax": 500, "revisionCompiledPromptMax": 4e3 };
const trace = { "toolArgsMaxChars": 2048, "toolResultMaxChars": 800, "labelMax": 4e3, "toolFieldMax": 4e3 };
const log = { "previewSnippetMax": 120, "commandPreviewMax": 160 };
const rawLimits = {
  sandbox,
  evaluator,
  trace,
  log
};
const ContentLimitsFileSchema = z.object({
  sandbox: z.object({
    grepMaxLineLength: z.number().int().min(1),
    lsMaxEntries: z.number().int().min(1),
    findMaxResults: z.number().int().min(1),
    grepDefaultMatchLimit: z.number().int().min(1),
    bashToolMaxChars: z.number().int().min(1)
  }).strict(),
  evaluator: z.object({
    fileMaxChars: z.number().int().min(1),
    bundleMaxChars: z.number().int().min(1),
    degradedMsgMax: z.number().int().min(1),
    revisionCompiledPromptMax: z.number().int().min(1)
  }).strict(),
  trace: z.object({
    toolArgsMaxChars: z.number().int().min(1),
    toolResultMaxChars: z.number().int().min(1),
    labelMax: z.number().int().min(1),
    toolFieldMax: z.number().int().min(1)
  }).strict(),
  log: z.object({
    previewSnippetMax: z.number().int().min(4),
    commandPreviewMax: z.number().int().min(4)
  }).strict()
}).strict();
const _limits = ContentLimitsFileSchema.parse(rawLimits);
const GREP_MAX_LINE_LENGTH = _limits.sandbox.grepMaxLineLength;
const SANDBOX_READ_MAX_LINES = DEFAULT_MAX_LINES;
const SANDBOX_LS_MAX_ENTRIES = _limits.sandbox.lsMaxEntries;
const SANDBOX_FIND_MAX_RESULTS = _limits.sandbox.findMaxResults;
const SANDBOX_GREP_DEFAULT_MATCH_LIMIT = _limits.sandbox.grepDefaultMatchLimit;
const BASH_TOOL_MAX_CHARS = _limits.sandbox.bashToolMaxChars;
const EVAL_FILE_MAX_CHARS = _limits.evaluator.fileMaxChars;
const EVAL_BUNDLE_MAX_CHARS = _limits.evaluator.bundleMaxChars;
const EVAL_DEGRADED_MSG_MAX = _limits.evaluator.degradedMsgMax;
const REVISION_COMPILED_PROMPT_MAX = _limits.evaluator.revisionCompiledPromptMax;
const PI_TOOL_ARGS_TRACE_MAX_CHARS = _limits.trace.toolArgsMaxChars;
const PI_TOOL_RESULT_TRACE_MAX_CHARS = _limits.trace.toolResultMaxChars;
const TRACE_LABEL_MAX = _limits.trace.labelMax;
const TRACE_TOOL_FIELD_MAX = _limits.trace.toolFieldMax;
const LOG_PREVIEW_SNIPPET_MAX = _limits.log.previewSnippetMax;
const LOG_PREVIEW_SNIPPET_HEAD_CHARS = _limits.log.previewSnippetMax - 3;
const LOG_COMMAND_PREVIEW_MAX = _limits.log.commandPreviewMax;
const LOG_COMMAND_PREVIEW_HEAD_CHARS = _limits.log.commandPreviewMax - 3;
const DEFAULT_TRUNC_SUFFIX = "\n…[truncated]";
function truncateUtf16WithSuffix(s, maxChars, suffix = DEFAULT_TRUNC_SUFFIX) {
  if (maxChars <= 0 || s.length <= maxChars) return s;
  return s.slice(0, maxChars) + suffix;
}
function observabilityLineForFile(line) {
  if (line.type === "incubate_parsed") {
    const max2 = env.LLM_LOG_MAX_BODY_CHARS;
    if (max2 <= 0) return line;
    const p2 = { ...line.payload };
    if (typeof p2.firstHypothesisText === "string" && p2.firstHypothesisText.length > max2) {
      p2.firstHypothesisText = truncateUtf16WithSuffix(p2.firstHypothesisText, max2);
    }
    return { ...line, payload: p2 };
  }
  if (line.type === "task_result" || line.type === "task_run") {
    const max2 = env.LLM_LOG_MAX_BODY_CHARS;
    if (max2 <= 0) return line;
    const p2 = { ...line.payload };
    for (const key of ["resultContent", "userPrompt", "error"]) {
      const v = p2[key];
      if (typeof v === "string" && v.length > max2) {
        p2[key] = truncateUtf16WithSuffix(v, max2);
      }
    }
    return { ...line, payload: p2 };
  }
  if (line.type === "trace") {
    const ev = { ...line.payload.event };
    const lab = ev.label;
    if (typeof lab === "string" && lab.length > TRACE_LABEL_MAX) {
      ev.label = truncateUtf16WithSuffix(lab, TRACE_LABEL_MAX);
    }
    for (const key of ["detail", "toolArgs", "toolResult"]) {
      const v = ev[key];
      if (typeof v === "string" && v.length > TRACE_TOOL_FIELD_MAX) {
        ev[key] = truncateUtf16WithSuffix(v, TRACE_TOOL_FIELD_MAX);
      }
    }
    return {
      ...line,
      payload: { ...line.payload, event: ev }
    };
  }
  const max = env.LLM_LOG_MAX_BODY_CHARS;
  if (max <= 0) return line;
  const p = { ...line.payload };
  if (typeof p.systemPrompt === "string") p.systemPrompt = truncateUtf16WithSuffix(p.systemPrompt, max);
  if (typeof p.userPrompt === "string") p.userPrompt = truncateUtf16WithSuffix(p.userPrompt, max);
  if (typeof p.response === "string") p.response = truncateUtf16WithSuffix(p.response, max);
  return { ...line, payload: p };
}
function resolveFilePath() {
  if (process.env.VITEST === "true") return null;
  const dir = env.OBSERVABILITY_LOG_BASE_DIR;
  if (!dir) return null;
  if (env.LLM_LOG_FILE_MODE === "single") {
    return path.join(dir, "observability.ndjson");
  }
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return path.join(dir, `observability-${date}.ndjson`);
}
const ensuredDirs = /* @__PURE__ */ new Set();
function writeObservabilityLine(line) {
  const filePath = resolveFilePath();
  if (!filePath) return;
  const dir = path.dirname(filePath);
  try {
    if (!ensuredDirs.has(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      ensuredDirs.add(dir);
    }
    const out = observabilityLineForFile(line);
    fs.appendFileSync(filePath, `${JSON.stringify(out)}
`, "utf8");
  } catch (err) {
    console.error("[observability-sink] append failed", err);
  }
}
const traceLines = [];
const traceIdInRing = /* @__PURE__ */ new Set();
function trimTraceToCap() {
  const max = env.LLM_LOG_MAX_ENTRIES;
  while (traceLines.length > max) {
    const dropped = traceLines.shift();
    if (dropped?.payload.event.id) traceIdInRing.delete(String(dropped.payload.event.id));
  }
}
function appendTraceLines(lines) {
  for (const row of lines) {
    const id = row.event.id;
    if (typeof id !== "string" || !id) continue;
    if (traceIdInRing.has(id)) continue;
    traceIdInRing.add(id);
    const at = row.event.at;
    const ts = typeof at === "string" && at ? at : (/* @__PURE__ */ new Date()).toISOString();
    const line = {
      v: OBSERVABILITY_SCHEMA_VERSION,
      ts,
      type: "trace",
      payload: {
        event: row.event,
        correlationId: row.correlationId,
        resultId: row.resultId
      }
    };
    traceLines.push(line);
    writeObservabilityLine(line);
  }
  trimTraceToCap();
  scheduleAgentLogSnapshot();
}
function getTraceLogLines() {
  return traceLines.map((t) => ({
    ...t,
    payload: {
      ...t.payload,
      event: { ...t.payload.event }
    }
  }));
}
function clearTraceLogEntries() {
  traceLines.length = 0;
  traceIdInRing.clear();
}
const traceLogStore = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  appendTraceLines,
  clearTraceLogEntries,
  getTraceLogLines
}, Symbol.toStringTag, { value: "Module" }));
const entries = [];
const taskLogEntries = [];
function trimToMaxCap() {
  const max = env.LLM_LOG_MAX_ENTRIES;
  while (entries.length > max) entries.shift();
}
function trimTaskLogToCap() {
  const max = env.LLM_LOG_MAX_ENTRIES;
  while (taskLogEntries.length > max) taskLogEntries.shift();
}
function appendTaskResultLogEntry(input) {
  const row = {
    id: crypto.randomUUID(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "task_result",
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    resultFile: input.resultFile,
    resultContent: input.resultContent,
    sandboxFilePaths: input.sandboxFilePaths
  };
  taskLogEntries.push(row);
  trimTaskLogToCap();
  scheduleAgentLogSnapshot();
}
function appendTaskRunLogEntry(input) {
  const row = {
    id: crypto.randomUUID(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "task_run",
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
  };
  taskLogEntries.push(row);
  trimTaskLogToCap();
  scheduleAgentLogSnapshot();
}
function getTaskLogEntries() {
  return taskLogEntries.map((e) => ({ ...e }));
}
function clearTaskLogEntries() {
  taskLogEntries.length = 0;
}
function appendIncubateParsedLogEntry(input) {
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  const row = {
    id: crypto.randomUUID(),
    timestamp: ts,
    kind: "incubate_parsed",
    correlationId: input.correlationId,
    hypothesisCount: input.hypothesisCount,
    hypothesisNames: input.hypothesisNames,
    firstHypothesisText: input.firstHypothesisText,
    dimensionCount: input.dimensionCount
  };
  taskLogEntries.push(row);
  trimTaskLogToCap();
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts,
    type: "incubate_parsed",
    payload: {
      correlationId: input.correlationId,
      hypothesisCount: input.hypothesisCount,
      hypothesisNames: input.hypothesisNames,
      firstHypothesisText: input.firstHypothesisText,
      dimensionCount: input.dimensionCount
    }
  });
  scheduleAgentLogSnapshot();
}
function logLlmCall(entry) {
  const status = entry.status ?? (entry.error ? "error" : "complete");
  const row = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    status
  };
  entries.push(row);
  trimToMaxCap();
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts: row.timestamp,
    type: "llm",
    payload: { ...row }
  });
  scheduleAgentLogSnapshot();
}
function beginLlmCall(entry) {
  const id = crypto.randomUUID();
  entries.push({
    ...entry,
    id,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    response: entry.response ?? "",
    durationMs: 0,
    status: "in_progress"
  });
  trimToMaxCap();
  scheduleAgentLogSnapshot();
  return id;
}
function appendLlmCallResponse(id, chunk) {
  if (!chunk) return;
  const row = entries.find((e) => e.id === id);
  if (!row || row.status !== "in_progress") return;
  row.response += chunk;
}
function setLlmCallResponseBody(id, body) {
  const row = entries.find((e) => e.id === id);
  if (!row || row.status !== "in_progress") return;
  row.response = body;
}
function setLlmCallWaitingStatus(id, message) {
  const row = entries.find((e) => e.id === id);
  if (!row || row.status !== "in_progress") return;
  row.response = message;
}
function finalizeLlmCall(id, patch) {
  const i = entries.findIndex((e) => e.id === id);
  if (i === -1) return;
  const prev = entries[i];
  const nextStatus = patch.error ? "error" : "complete";
  const finalized = {
    ...prev,
    ...patch,
    id: prev.id,
    timestamp: prev.timestamp,
    status: nextStatus
  };
  entries[i] = finalized;
  writeObservabilityLine({
    v: OBSERVABILITY_SCHEMA_VERSION,
    ts: finalized.timestamp,
    type: "llm",
    payload: { ...finalized }
  });
  scheduleAgentLogSnapshot();
}
function failLlmCall(id, error, durationMs) {
  finalizeLlmCall(id, {
    error,
    durationMs,
    response: entries.find((e) => e.id === id)?.response ?? ""
  });
}
function getLogEntries() {
  return entries.map((e) => ({ ...e }));
}
function getLlmLogResponseSnapshot(id) {
  return entries.find((e) => e.id === id)?.response;
}
function clearLogEntries() {
  entries.length = 0;
  clearTraceLogEntries();
  clearTaskLogEntries();
  flushAgentLogSnapshotNow();
}
const logStore = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  appendIncubateParsedLogEntry,
  appendLlmCallResponse,
  appendTaskResultLogEntry,
  appendTaskRunLogEntry,
  beginLlmCall,
  clearLogEntries,
  clearTaskLogEntries,
  failLlmCall,
  finalizeLlmCall,
  getLlmLogResponseSnapshot,
  getLogEntries,
  getTaskLogEntries,
  logLlmCall,
  setLlmCallResponseBody,
  setLlmCallWaitingStatus
}, Symbol.toStringTag, { value: "Module" }));
export {
  BASH_TOOL_MAX_CHARS as B,
  EVAL_BUNDLE_MAX_CHARS as E,
  GREP_MAX_LINE_LENGTH as G,
  LOG_PREVIEW_SNIPPET_MAX as L,
  OBSERVABILITY_SCHEMA_VERSION as O,
  PI_TOOL_RESULT_TRACE_MAX_CHARS as P,
  REVISION_COMPILED_PROMPT_MAX as R,
  SANDBOX_READ_MAX_LINES as S,
  appendIncubateParsedLogEntry as a,
  getTraceLogLines as b,
  getLogEntries as c,
  appendTraceLines as d,
  clearLogEntries as e,
  EVAL_FILE_MAX_CHARS as f,
  getTaskLogEntries as g,
  beginLlmCall as h,
  finalizeLlmCall as i,
  failLlmCall as j,
  EVAL_DEGRADED_MSG_MAX as k,
  appendTaskRunLogEntry as l,
  appendTaskResultLogEntry as m,
  getLlmLogResponseSnapshot as n,
  LOG_PREVIEW_SNIPPET_HEAD_CHARS as o,
  SANDBOX_LS_MAX_ENTRIES as p,
  SANDBOX_FIND_MAX_RESULTS as q,
  SANDBOX_GREP_DEFAULT_MATCH_LIMIT as r,
  setLlmCallWaitingStatus as s,
  PI_TOOL_ARGS_TRACE_MAX_CHARS as t,
  truncateUtf16WithSuffix as u,
  LOG_COMMAND_PREVIEW_MAX as v,
  writeObservabilityLine as w,
  LOG_COMMAND_PREVIEW_HEAD_CHARS as x,
  appendLlmCallResponse as y
};
