import { b as LOCKDOWN_MODEL_ID, c as LOCKDOWN_PROVIDER_ID, F as FEATURE_LOCKDOWN } from "./feature-flags-XVIYZipX.js";
import { e as env } from "../[[...route]].js";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import "@mariozechner/pi-ai";
import { createReadToolDefinition, createWriteToolDefinition, createEditToolDefinition, createLsToolDefinition, createFindToolDefinition, grepToolDefinition, truncateLine, truncateHead, formatSize, DEFAULT_MAX_BYTES, compact, SettingsManager, DefaultResourceLoader, createAgentSession, SessionManager, AuthStorage } from "@mariozechner/pi-coding-agent";
import { n as normalizeError, c as completionBudgetFromPromptTokens, e as estimateTextTokens, g as getProvider, b as getProviderModelContextWindow } from "./registry-B7is6TUr.js";
import { Bash } from "just-bash";
import { n as normalizeOpenRouterCreditError } from "./openrouter-budget-B6nu86e7.js";
import { performance } from "node:perf_hooks";
import { h as beginLlmCall, n as getLlmLogResponseSnapshot, i as finalizeLlmCall, j as failLlmCall, B as BASH_TOOL_MAX_CHARS, L as LOG_PREVIEW_SNIPPET_MAX, o as LOG_PREVIEW_SNIPPET_HEAD_CHARS, S as SANDBOX_READ_MAX_LINES, p as SANDBOX_LS_MAX_ENTRIES, q as SANDBOX_FIND_MAX_RESULTS, r as SANDBOX_GREP_DEFAULT_MATCH_LIMIT, G as GREP_MAX_LINE_LENGTH, P as PI_TOOL_RESULT_TRACE_MAX_CHARS, t as PI_TOOL_ARGS_TRACE_MAX_CHARS, u as truncateUtf16WithSuffix, v as LOG_COMMAND_PREVIEW_MAX, x as LOG_COMMAND_PREVIEW_HEAD_CHARS, y as appendLlmCallResponse } from "./log-store-BzjCnWkn.js";
import { Type } from "@sinclair/typebox";
import { Script } from "node:vm";
import { minimatch } from "minimatch";
import { R as ReferenceImageSchema, b as ThinkingOverrideSchema, T as ThinkingLevelSchema, D as DesignSpecSchema } from "./thinking-defaults-BkNuccwq.js";
function splitFrontmatterMarkdown(raw) {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const frontmatterYaml = lines.slice(1, end).join("\n");
  const body = lines.slice(end + 1).join("\n").replace(/^\n+/, "");
  return { frontmatterYaml, body };
}
const skillWhenSchema = z.enum(["auto", "always", "manual"]);
const skillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).max(1024),
  tags: z.array(z.string()).optional().default([]),
  when: skillWhenSchema.optional().default("auto")
});
const SKILL_FILENAME = "SKILL.md";
const SESSION_TAGS = {
  design: ["design"],
  incubation: ["incubation"],
  "internal-context": ["internal-context"],
  evaluation: ["evaluation"],
  "inputs-gen": ["inputs-gen"],
  "design-system": ["design-system"]
};
function resolveSkillsRoot(explicit) {
  if (explicit?.trim()) return path.resolve(explicit.trim());
  const fromEnv = process.env.SKILLS_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "skills");
}
function splitSkillMarkdown(raw) {
  return splitFrontmatterMarkdown(raw);
}
async function safeReadSkillDir(skillsRoot, name) {
  if (name.startsWith("_") || name.startsWith(".")) return null;
  const dir = path.join(skillsRoot, name);
  const skillPath = path.join(dir, SKILL_FILENAME);
  let raw;
  try {
    raw = await fs.readFile(skillPath, "utf8");
  } catch {
    return null;
  }
  const split = splitSkillMarkdown(raw);
  if (!split) return null;
  let data;
  try {
    data = parse(split.frontmatterYaml);
  } catch (err) {
    if (env.isDev) {
      console.warn(`[skill-discovery] Invalid YAML in ${skillPath}`, err);
    }
    return null;
  }
  const parsed = skillFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    if (env.isDev) {
      console.warn(`[skill-discovery] Invalid skill frontmatter in ${skillPath}`, parsed.error.flatten());
    }
    return null;
  }
  return {
    ...parsed.data,
    key: name,
    dir,
    bodyMarkdown: split.body
  };
}
function filterSkillsForSession(entries, sessionType) {
  const allowedTags = SESSION_TAGS[sessionType];
  return entries.filter((e) => {
    if (e.when === "manual") return false;
    return e.tags.some((t) => allowedTags.includes(t));
  });
}
async function discoverSkills(skillsRoot) {
  let names;
  try {
    names = await fs.readdir(skillsRoot);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const ent = await safeReadSkillDir(skillsRoot, name);
    if (ent) out.push(ent);
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
function catalogEntriesToSummaries(entries) {
  return entries.map((s) => ({
    key: s.key,
    name: s.name,
    description: s.description
  }));
}
function formatSkillsCatalogXml(rows) {
  if (rows.length === 0) return "";
  const intro = [
    "Load a skill's full instructions into context. Call before implementing work that matches a skill's description.",
    "Parameter `name` is the skill key (directory name under skills/), same as the XML `key` attribute below.",
    ""
  ].join("\n");
  const lines = rows.map(
    (s) => `  <skill key="${escapeXmlAttr(s.key)}" name="${escapeXmlAttr(s.name)}">${escapeXmlAttr(s.description)}</skill>`
  );
  return `

<available_skills>
${intro}${lines.join("\n")}
</available_skills>
`;
}
function buildUseSkillToolDescription(rows) {
  const catalog = formatSkillsCatalogXml(rows).trim();
  if (!catalog) {
    return "use_skill: No repo skills are configured for this session (or all are manual). Do not call this tool until skills exist.";
  }
  return `use_skill: ${catalog}`;
}
function escapeXmlAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const skillBodyCache = /* @__PURE__ */ new Map();
async function getSkillBody(key, skillsRoot) {
  const cached = skillBodyCache.get(key);
  if (cached !== void 0) return cached;
  const root = resolveSkillsRoot(skillsRoot);
  const entry = await safeReadSkillDir(root, key);
  if (!entry) throw new Error(`Skill "${key}" not found under ${root}`);
  skillBodyCache.set(key, entry.bodyMarkdown);
  return entry.bodyMarkdown;
}
const promptFrontmatterSchema = z.object({
  name: z.string().min(1),
  type: z.literal("system-prompt"),
  description: z.string().min(1)
});
const cache = /* @__PURE__ */ new Map();
function resolvePromptsRoot() {
  const fromEnv = process.env.PROMPTS_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "prompts");
}
function splitPromptMarkdown(raw) {
  return splitFrontmatterMarkdown(raw);
}
async function getSystemPromptBody(name) {
  const cached = cache.get(name);
  if (cached !== void 0) return cached;
  const promptsRoot = resolvePromptsRoot();
  const filePath = path.join(promptsRoot, name, "PROMPT.md");
  const raw = await fs.readFile(filePath, "utf8");
  const split = splitPromptMarkdown(raw);
  if (!split) throw new Error(`Invalid PROMPT.md frontmatter in ${filePath}`);
  let data;
  try {
    data = parse(split.frontmatterYaml);
  } catch {
    throw new Error(`Invalid YAML in ${filePath}`);
  }
  const parsed = promptFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid frontmatter schema in ${filePath}: ${parsed.error.message}`);
  }
  cache.set(name, split.body);
  return split.body;
}
function isLockdownEnabled() {
  return FEATURE_LOCKDOWN;
}
function clampProviderModel(providerId, modelId) {
  if (!isLockdownEnabled()) return { providerId, modelId };
  return { providerId: LOCKDOWN_PROVIDER_ID, modelId: LOCKDOWN_MODEL_ID };
}
function clampEvaluatorOptional(evaluatorProviderId, evaluatorModelId) {
  if (!isLockdownEnabled()) {
    return { evaluatorProviderId, evaluatorModelId };
  }
  return {
    evaluatorProviderId: LOCKDOWN_PROVIDER_ID,
    evaluatorModelId: LOCKDOWN_MODEL_ID
  };
}
function applyLockdownToHypothesisContext(ctx) {
  if (!isLockdownEnabled()) return ctx;
  return {
    ...ctx,
    modelCredentials: ctx.modelCredentials.map((c) => {
      const pin = clampProviderModel(c.providerId, c.modelId);
      return { ...c, providerId: pin.providerId, modelId: pin.modelId };
    })
  };
}
const SSE_EVENT_NAMES = {
  progress: "progress",
  activity: "activity",
  thinking: "thinking",
  streaming_tool: "streaming_tool",
  trace: "trace",
  code: "code",
  error: "error",
  file: "file",
  plan: "plan",
  todos: "todos",
  phase: "phase",
  evaluation_progress: "evaluation_progress",
  evaluation_worker_done: "evaluation_worker_done",
  evaluation_report: "evaluation_report",
  revision_round: "revision_round",
  skills_loaded: "skills_loaded",
  skill_activated: "skill_activated",
  checkpoint: "checkpoint",
  lane_done: "lane_done",
  done: "done",
  /** POST /api/incubate final incubation plan (after streaming deltas). */
  incubate_result: "incubate_result",
  /** Generic agentic task result — carries the extracted output from the sandbox. */
  task_result: "task_result"
};
function normalizeProviderError(err, fallback) {
  return normalizeOpenRouterCreditError(err) ?? normalizeError(err, fallback);
}
function agenticOrchestratorEventToSse(event) {
  switch (event.type) {
    case "phase":
      return { sseEvent: SSE_EVENT_NAMES.phase, data: { phase: event.phase } };
    case "evaluation_progress":
      return {
        sseEvent: SSE_EVENT_NAMES.evaluation_progress,
        data: {
          round: event.round,
          phase: event.phase,
          message: event.message
        }
      };
    case "evaluation_worker_done":
      return {
        sseEvent: SSE_EVENT_NAMES.evaluation_worker_done,
        data: { round: event.round, rubric: event.rubric, report: event.report }
      };
    case "evaluation_report":
      return {
        sseEvent: SSE_EVENT_NAMES.evaluation_report,
        data: { round: event.round, snapshot: event.snapshot }
      };
    case "revision_round":
      return {
        sseEvent: SSE_EVENT_NAMES.revision_round,
        data: { round: event.round, brief: event.brief }
      };
    case "streaming_tool":
      return {
        sseEvent: SSE_EVENT_NAMES.streaming_tool,
        data: {
          toolName: event.toolName,
          streamedChars: event.streamedChars,
          done: event.done,
          ...event.toolPath != null ? { toolPath: event.toolPath } : {}
        }
      };
    case "skills_loaded":
      return { sseEvent: SSE_EVENT_NAMES.skills_loaded, data: { skills: event.skills } };
    case "skill_activated":
      return {
        sseEvent: SSE_EVENT_NAMES.skill_activated,
        data: { key: event.key, name: event.name, description: event.description }
      };
    case "trace":
      return { sseEvent: SSE_EVENT_NAMES.trace, data: { trace: event.trace } };
    case "thinking":
      return {
        sseEvent: SSE_EVENT_NAMES.thinking,
        data: { delta: event.payload, turnId: event.turnId }
      };
    case "activity":
      return { sseEvent: SSE_EVENT_NAMES.activity, data: { entry: event.payload } };
    case "code":
      return { sseEvent: SSE_EVENT_NAMES.code, data: { code: event.payload } };
    case "error":
      return { sseEvent: SSE_EVENT_NAMES.error, data: { error: event.payload } };
    case "file":
      return { sseEvent: SSE_EVENT_NAMES.file, data: { path: event.path, content: event.content } };
    case "plan":
      return { sseEvent: SSE_EVENT_NAMES.plan, data: { files: event.files } };
    case "todos":
      return { sseEvent: SSE_EVENT_NAMES.todos, data: { todos: event.todos } };
    case "progress":
      return { sseEvent: SSE_EVENT_NAMES.progress, data: { status: event.payload } };
    default: {
      const _exhaustive = event;
      return _exhaustive;
    }
  }
}
let activeSlots = 0;
let gateChain = Promise.resolve();
async function acquireAgenticSlotOrReject() {
  return new Promise((resolve) => {
    gateChain = gateChain.then(() => {
      const max = env.MAX_CONCURRENT_AGENTIC_RUNS;
      if (activeSlots >= max) {
        resolve(false);
        return;
      }
      activeSlots += 1;
      resolve(true);
    });
  });
}
function releaseAgenticSlot() {
  gateChain = gateChain.then(() => {
    activeSlots = Math.max(0, activeSlots - 1);
  });
}
function makeRunTraceEvent(fields) {
  return {
    ...fields,
    id: fields.id ?? crypto.randomUUID(),
    at: fields.at ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function emitSkillsLoadedEvents(emit, skills, tracePhase) {
  const label = skills.length === 0 ? "No agent skills in catalog for this session" : `Skills catalog (${skills.length}): ${skills.map((s) => s.name).join(", ")}`;
  await emit({
    type: "trace",
    trace: makeRunTraceEvent({
      kind: "skills_loaded",
      label,
      phase: tracePhase,
      status: skills.length === 0 ? "info" : "success"
    })
  });
  await emit({ type: "skills_loaded", skills });
}
async function buildAgenticSystemContext(input) {
  const systemPrompt = await getSystemPromptBody("designer-agentic-system");
  const sandboxSeedFiles = {};
  const sessionType = input.sessionType ?? "design";
  const skillsRoot = resolveSkillsRoot(input.skillsRoot);
  const allEntries = await discoverSkills(skillsRoot);
  const catalogEntries = filterSkillsForSession(allEntries, sessionType);
  const loadedSkills = catalogEntriesToSummaries(catalogEntries);
  if (env.isDev) {
    console.debug("[agentic-context] skills", {
      sessionType,
      discovered: allEntries.length,
      filtered: catalogEntries.length,
      keys: catalogEntries.map((e) => e.key),
      seedFileCount: Object.keys(sandboxSeedFiles).length,
      systemPromptChars: systemPrompt.length
    });
  }
  return { systemPrompt, sandboxSeedFiles, loadedSkills, skillCatalog: catalogEntries };
}
function estimateUserMessageContent(content) {
  if (typeof content === "string") return estimateTextTokens(content);
  let n = 0;
  for (const p of content) {
    if (p.type === "text" && typeof p.text === "string") n += estimateTextTokens(p.text);
    else if (p.type === "thinking" && typeof p.thinking === "string") {
      n += estimateTextTokens(p.thinking);
    } else if (p.type === "image" && typeof p.data === "string") n += 2500;
  }
  return Math.max(n, 6);
}
function estimatePiContextTokens(context) {
  let n = estimateTextTokens(context.systemPrompt ?? "");
  for (const m of context.messages) {
    if (m.role === "user" || m.role === "toolResult") {
      n += estimateUserMessageContent(m.content);
    } else if (m.role === "assistant") {
      for (const c of m.content) {
        if (c.type === "text") n += estimateTextTokens(c.text);
        else if (c.type === "thinking") n += estimateTextTokens(c.thinking);
        else if (c.type === "toolCall") {
          n += estimateTextTokens(JSON.stringify(c.arguments ?? {}));
          n += estimateTextTokens(c.name);
        }
      }
    }
  }
  if (context.tools?.length) {
    for (const t of context.tools) {
      n += estimateTextTokens(`${t.name}
${t.description}
${JSON.stringify(t.parameters ?? {})}`);
    }
  }
  return Math.ceil(n * 1.04);
}
function piStreamCompletionMaxTokens(model, context, explicitFromOptions) {
  if (explicitFromOptions != null) return explicitFromOptions;
  const est = estimatePiContextTokens(context);
  const product = env.MAX_OUTPUT_TOKENS;
  const dynamic = completionBudgetFromPromptTokens(
    model.contextWindow,
    est,
    "agent_turn",
    product ?? void 0
  );
  const ceil = Math.min(model.maxTokens, product ?? model.maxTokens);
  if (dynamic == null) return ceil;
  return Math.min(dynamic, ceil);
}
function emitEvent(onEvent, event, optionsOrOnFail) {
  const opts = typeof optionsOrOnFail === "function" ? { onFail: optionsOrOnFail } : optionsOrOnFail ?? {};
  const label = opts.label ?? "[pi-emit]";
  const handle = (e) => {
    console.error(`${label} onEvent failed`, normalizeError(e), e);
    opts.onFail?.(e);
  };
  try {
    const ret = onEvent(event);
    if (ret && typeof ret.then === "function") {
      ret.catch(handle);
    }
  } catch (e) {
    handle(e);
  }
}
const SANDBOX_PROJECT_ROOT = "/home/user/project";
function sandboxProjectAbsPath(rel) {
  const trimmed = rel.replace(/^\/+/, "");
  return `${SANDBOX_PROJECT_ROOT}/${trimmed}`;
}
function buildSandboxSeedMaps(options) {
  const files = {};
  if (options.seedFiles) {
    for (const [path2, content] of Object.entries(options.seedFiles)) {
      files[sandboxProjectAbsPath(path2)] = content;
    }
  }
  return files;
}
function createAgentBashSandbox(options) {
  const files = buildSandboxSeedMaps(options);
  return new Bash({
    files,
    cwd: SANDBOX_PROJECT_ROOT,
    executionLimits: {
      maxCommandCount: 5e3,
      maxLoopIterations: 5e3,
      maxSedIterations: 5e3,
      maxAwkIterations: 5e3
    }
  });
}
async function extractDesignFiles(bash) {
  const paths = bash.fs.getAllPaths().filter((p) => {
    if (!p.startsWith(`${SANDBOX_PROJECT_ROOT}/`) && p !== SANDBOX_PROJECT_ROOT) return false;
    if (p === SANDBOX_PROJECT_ROOT) return false;
    return true;
  });
  const out = {};
  for (const abs of paths.sort()) {
    let stat;
    try {
      stat = await bash.fs.stat(abs);
    } catch {
      if (env.isDev) {
        console.warn("[sandbox] extractDesignFiles: stat failed for", abs);
      }
      continue;
    }
    if (!stat.isFile) continue;
    let body;
    try {
      body = await bash.fs.readFile(abs, "utf8");
    } catch {
      if (env.isDev) {
        console.warn("[sandbox] extractDesignFiles: readFile failed for", abs);
      }
      continue;
    }
    const rel = abs.startsWith(`${SANDBOX_PROJECT_ROOT}/`) ? abs.slice(SANDBOX_PROJECT_ROOT.length + 1) : abs;
    out[rel] = body;
  }
  return out;
}
function computeDesignFilesBeyondSeed(extracted, seedFiles) {
  if (!seedFiles || Object.keys(seedFiles).length === 0) {
    return { ...extracted };
  }
  const out = {};
  for (const [path2, content] of Object.entries(extracted)) {
    const seedContent = seedFiles[path2];
    if (seedContent === void 0) {
      out[path2] = content;
    } else if (seedContent !== content) {
      out[path2] = content;
    }
  }
  return out;
}
async function snapshotDesignFiles(bash) {
  const files = await extractDesignFiles(bash);
  return new Map(Object.entries(files));
}
const DEBUG_AGENT_INGEST_URL = "http://127.0.0.1:7576/ingest/83c687e1-03e6-457d-9b2a-e5ea8f1db0e1";
const DEBUG_AGENT_INGEST_SESSION_ID = "5b9be9";
function buildDebugAgentIngestBody(payload) {
  const sessionId = payload.sessionId ?? DEBUG_AGENT_INGEST_SESSION_ID;
  return JSON.stringify({
    ...payload,
    sessionId,
    timestamp: Date.now()
  });
}
function debugAgentIngest(payload) {
  if (process.env.DEBUG_AGENT_INGEST !== "1") return;
  const sessionId = payload.sessionId ?? DEBUG_AGENT_INGEST_SESSION_ID;
  fetch(DEBUG_AGENT_INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": sessionId
    },
    body: buildDebugAgentIngestBody(payload)
  }).catch(() => {
  });
}
function providerLogFields(providerId) {
  const name = getProvider(providerId)?.name;
  return name && name !== providerId ? { provider: providerId, providerName: name } : { provider: providerId };
}
function stripProviderControlTokens(text) {
  if (!text) return text;
  return text.replace(/<ctrl\d+>/gi, "");
}
function mergeStreamedAndFormattedAssistantResponse(streamed, formatted) {
  const s = streamed.length;
  const f = formatted.length;
  if (s > f) return streamed;
  return formatted;
}
const PI_LLM_LOG_PHASE = {
  AGENTIC_TURN: "agentic_turn",
  REVISION: "revision"
};
function mapSessionTypeToLlmLogSource(sessionType) {
  switch (sessionType) {
    case "incubation":
      return "incubator";
    case "inputs-gen":
      return "inputsGen";
    case "internal-context":
      return "internalContext";
    case "design-system":
      return "designSystem";
    case "evaluation":
    case "design":
    default:
      return "builder";
  }
}
function userOrToolContentToString(content) {
  if (typeof content === "string") return content;
  return content.map((p) => p.type === "text" ? p.text : "[image]").join("");
}
function piContextToLogFields(context) {
  const systemPrompt = context.systemPrompt?.trim() || "(no system message)";
  const formatOne = (m) => {
    if (m.role === "user") {
      return userOrToolContentToString(m.content);
    }
    if (m.role === "toolResult") {
      const body = userOrToolContentToString(m.content);
      return `[tool_result ${m.toolName}]
${body}`;
    }
    if (m.role === "assistant") {
      return formatAssistantForLog(m);
    }
    return "";
  };
  const chunks = context.messages.map(formatOne).filter(Boolean);
  return {
    systemPrompt,
    userPrompt: chunks.join("\n\n") || "(no user message)"
  };
}
function formatAssistantForLog(m) {
  const parts = [];
  for (const c of m.content) {
    if (c.type === "text") parts.push(stripProviderControlTokens(c.text));
    else if (c.type === "thinking")
      parts.push(`[thinking]
${stripProviderControlTokens(c.thinking)}`);
    else if (c.type === "toolCall") {
      const path2 = typeof c.arguments?.path === "string" ? c.arguments.path : void 0;
      const cmd = typeof c.arguments?.command === "string" ? c.arguments.command : void 0;
      if (c.name === "bash" && cmd) {
        const short = cmd.length > 200 ? `${cmd.slice(0, 197)}…` : cmd;
        parts.push(`[tool_call ${c.name} command=${JSON.stringify(short)}]`);
      } else {
        parts.push(
          path2 ? `[tool_call ${c.name} path=${path2}]` : `[tool_call ${c.name} ${JSON.stringify(c.arguments)}]`
        );
      }
    }
  }
  return parts.join("\n");
}
function toolCallsForLog(m) {
  const out = [];
  for (const c of m.content) {
    if (c.type !== "toolCall") continue;
    const path2 = typeof c.arguments?.path === "string" ? c.arguments.path : void 0;
    out.push({ name: c.name, path: path2 });
  }
  return out;
}
function wrapPiStreamWithLogging(inner, params) {
  return ((model, context, options) => {
    const streamMax = piStreamCompletionMaxTokens(model, context, options?.maxTokens);
    return Promise.resolve(
      inner(model, context, { ...options, maxTokens: streamMax })
    ).then((stream) => {
      const t0 = performance.now();
      const pv = providerLogFields(params.providerId);
      const modelLabel = params.modelId || model.id;
      const { systemPrompt, userPrompt } = piContextToLogFields(context);
      const logId = beginLlmCall({
        source: params.source,
        phase: params.phase,
        model: modelLabel,
        ...pv,
        systemPrompt,
        userPrompt,
        response: "",
        ...params.correlationId ? { correlationId: params.correlationId } : {}
      });
      params.turnLogRef.current = logId;
      void (async () => {
        try {
          const final = await stream.result();
          const formatted = formatAssistantForLog(final);
          const streamed = getLlmLogResponseSnapshot(logId) ?? "";
          const response = mergeStreamedAndFormattedAssistantResponse(streamed, formatted);
          const toolCalls = toolCallsForLog(final);
          finalizeLlmCall(logId, {
            response,
            durationMs: Math.round(performance.now() - t0),
            promptTokens: final.usage?.input,
            completionTokens: final.usage?.output,
            totalTokens: final.usage?.totalTokens,
            truncated: final.stopReason === "length",
            toolCalls: toolCalls.length ? toolCalls : void 0,
            error: final.stopReason === "error" || final.stopReason === "aborted" ? final.errorMessage ?? final.stopReason : void 0
          });
        } catch (err) {
          failLlmCall(logId, normalizeError(err), Math.round(performance.now() - t0));
        } finally {
          if (params.turnLogRef.current === logId) {
            params.turnLogRef.current = void 0;
          }
        }
      })();
      return stream;
    });
  });
}
const ZEROED_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const SESSION_CEILING_FALLBACK_MARGIN = 8192;
function maxCompletionBudgetForContextWindow(totalContext) {
  const capped = completionBudgetFromPromptTokens(
    totalContext,
    0,
    "default",
    env.MAX_OUTPUT_TOKENS
  );
  if (capped != null) return capped;
  return Math.max(
    4096,
    Math.max(4096, totalContext) - SESSION_CEILING_FALLBACK_MARGIN
  );
}
function buildModel(providerId, modelId, thinkingLevel, contextWindowFromRegistry) {
  const reasoning = !!thinkingLevel && thinkingLevel !== "off";
  const defaultCw = providerId === "lmstudio" ? env.LM_STUDIO_CONTEXT_WINDOW : 131072;
  const contextWindow = Math.max(4096, contextWindowFromRegistry ?? defaultCw);
  const maxTokens = maxCompletionBudgetForContextWindow(contextWindow);
  if (providerId === "lmstudio") {
    return {
      id: modelId,
      name: modelId,
      api: "openai-completions",
      provider: "lmstudio",
      baseUrl: `${env.LMSTUDIO_URL}/v1`,
      reasoning,
      input: ["text"],
      cost: ZEROED_COST,
      contextWindow,
      maxTokens
    };
  }
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "openrouter",
    baseUrl: `${env.OPENROUTER_BASE_URL}/api/v1`,
    reasoning,
    input: ["text"],
    cost: ZEROED_COST,
    contextWindow,
    maxTokens
  };
}
function piToolParams(params) {
  return params;
}
const bashParams = Type.Object({
  command: Type.String({
    description: "Shell command in the just-bash sandbox (cwd is the project root). No package managers or host binaries — only built-in commands (e.g. rg, grep, sed, awk, jq, cat, find). Prefer read/write/edit tools for files; use bash for text pipelines or when no dedicated tool fits."
  })
});
function createSandboxBashTool(bash, onFile) {
  return {
    name: "bash",
    label: "bash",
    description: `Run a shell command in the just-bash virtual shell at ${SANDBOX_PROJECT_ROOT} (your cwd). This is not a full Linux machine: no npm, node, python, or external binaries — only just-bash built-ins (text tools like rg, grep, sed, awk, jq, pipes). For creating or editing design files, prefer the \`write\` and \`edit\` tools; use \`read\` instead of \`cat\`. Use bash for multi-step text pipelines or utilities when no dedicated tool fits.`,
    parameters: bashParams,
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { command } = piToolParams(params);
      const before = await snapshotDesignFiles(bash);
      const result = await bash.exec(command, { signal: signal ?? void 0 });
      const after = await snapshotDesignFiles(bash);
      for (const [rel, content] of after) {
        if (before.get(rel) !== content) {
          onFile(rel, content);
        }
      }
      const merged = [result.stdout, result.stderr].filter(Boolean).join("\n");
      const prefix = result.exitCode !== 0 ? `[exit ${result.exitCode}]
` : "";
      const body = merged || (result.exitCode !== 0 ? "(no stdout/stderr)" : "(no output)");
      const full = prefix + body;
      const text = full.length > BASH_TOOL_MAX_CHARS ? `${full.slice(0, BASH_TOOL_MAX_CHARS)}
[Output truncated at ${BASH_TOOL_MAX_CHARS} characters]` : full;
      return {
        content: [{ type: "text", text }],
        details: null
      };
    }
  };
}
const GOOGLE_FONTS_CSS_HOSTS = ["fonts.googleapis.com"];
const GOOGLE_FONTS_ASSET_HOSTS = ["fonts.gstatic.com"];
function parseUrlHost(ref) {
  const raw = ref.trim();
  if (!raw || raw.startsWith("data:")) return null;
  try {
    if (raw.startsWith("//")) return new URL(`https:${raw}`).hostname.toLowerCase();
    if (/^https?:\/\//i.test(raw)) return new URL(raw).hostname.toLowerCase();
    return null;
  } catch {
    return null;
  }
}
function isAllowedGoogleFontStylesheetUrl(ref) {
  const host = parseUrlHost(ref);
  if (!host) return false;
  return GOOGLE_FONTS_CSS_HOSTS.some((h) => host === h);
}
function isAllowedGoogleFontAssetHost(ref) {
  const host = parseUrlHost(ref);
  if (!host) return false;
  return GOOGLE_FONTS_ASSET_HOSTS.some((h) => host === h);
}
function isAllowedGoogleFontsExternalRef(ref) {
  return isAllowedGoogleFontStylesheetUrl(ref) || isAllowedGoogleFontAssetHost(ref);
}
function resolveVirtualAssetPath(ref, htmlFilePath) {
  const clean = ref.split("#")[0].split("?")[0].trim();
  if (!clean) return void 0;
  if (/^(https?:)?\/\//i.test(clean) || clean.startsWith("data:")) return void 0;
  if (/^(mailto|javascript|tel):/i.test(clean)) return void 0;
  let joined;
  if (clean.startsWith("/")) {
    joined = clean.slice(1);
  } else {
    const lastSlash = htmlFilePath.lastIndexOf("/");
    const dir = lastSlash >= 0 ? htmlFilePath.slice(0, lastSlash) : "";
    joined = dir ? `${dir}/${clean}` : clean;
  }
  const segments = joined.split("/").filter((s) => s.length > 0 && s !== ".");
  const out = [];
  for (const seg of segments) {
    if (seg === "..") {
      out.pop();
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}
function classifyAssetRef(ref) {
  const clean = ref.split("#")[0].split("?")[0].trim();
  if (/^(https?:)?\/\//i.test(clean) || clean.startsWith("data:")) return "external";
  if (clean.startsWith("/")) return "absolute";
  return "relative";
}
function extractCssImportUrls(css) {
  const urls = [];
  const urlParen = /@import\s+url\s*\(\s*["']?([^"')]+)["']?\s*\)\s*;?/gi;
  const quoted = /@import\s+["']([^"']+)["']\s*;?/gi;
  let m;
  while ((m = urlParen.exec(css)) !== null) {
    const u = m[1]?.trim();
    if (u) urls.push(u);
  }
  while ((m = quoted.exec(css)) !== null) {
    const u = m[1]?.trim();
    if (u) urls.push(u);
  }
  return urls;
}
async function validateHtmlWorkspaceContent(content, htmlPath, hasProjectFile2) {
  const issues = [];
  if (!/<!DOCTYPE\s+html/i.test(content)) {
    issues.push("Missing DOCTYPE declaration");
  }
  for (const tag of ["html", "head", "body"]) {
    if (!new RegExp(`<${tag}[\\s>]`, "i").test(content)) {
      issues.push(`Missing <${tag}> tag`);
    }
  }
  const scriptOpen = (content.match(/<script/gi) ?? []).length;
  const scriptClose = (content.match(/<\/script>/gi) ?? []).length;
  if (scriptOpen !== scriptClose) {
    issues.push(`Unbalanced <script> tags: ${scriptOpen} opening, ${scriptClose} closing`);
  }
  const styleOpen = (content.match(/<style/gi) ?? []).length;
  const styleClose = (content.match(/<\/style>/gi) ?? []).length;
  if (styleOpen !== styleClose) {
    issues.push(`Unbalanced <style> tags: ${styleOpen} opening, ${styleClose} closing`);
  }
  const stylesheetRefs = [
    ...content.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi)
  ].map((match) => match[1] ?? "");
  const scriptRefs = [
    ...content.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)
  ].map((match) => match[1] ?? "");
  for (const ref of stylesheetRefs) {
    const kind = classifyAssetRef(ref);
    if (kind === "external") {
      if (isAllowedGoogleFontStylesheetUrl(ref)) continue;
      issues.push(`External asset reference found: ${ref}`);
      continue;
    }
    if (kind === "absolute") {
      issues.push(`Use relative asset paths instead of root-absolute paths: ${ref}`);
    }
    const resolved = resolveVirtualAssetPath(ref, htmlPath);
    if (!resolved) continue;
    if (!await hasProjectFile2(resolved)) {
      issues.push(`Referenced asset not found in workspace: ${ref}`);
    }
  }
  for (const ref of scriptRefs) {
    const kind = classifyAssetRef(ref);
    if (kind === "external") {
      issues.push(`External asset reference found: ${ref}`);
      continue;
    }
    if (kind === "absolute") {
      issues.push(`Use relative asset paths instead of root-absolute paths: ${ref}`);
    }
    const resolved = resolveVirtualAssetPath(ref, htmlPath);
    if (!resolved) continue;
    if (!await hasProjectFile2(resolved)) {
      issues.push(`Referenced asset not found in workspace: ${ref}`);
    }
  }
  for (const styleMatch of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = styleMatch[1] ?? "";
    for (const importUrl of extractCssImportUrls(css)) {
      if (classifyAssetRef(importUrl) !== "external") continue;
      if (isAllowedGoogleFontsExternalRef(importUrl)) continue;
      issues.push(`External @import in <style> not allowed: ${importUrl}`);
    }
  }
  return issues;
}
async function readProjectFile(bash, rel) {
  const abs = sandboxProjectAbsPath(rel);
  try {
    if (!await bash.fs.exists(abs)) return void 0;
    const st = await bash.fs.stat(abs);
    if (!st.isFile) return void 0;
    return await bash.fs.readFile(abs, "utf8");
  } catch {
    return void 0;
  }
}
async function hasProjectFile(bash, rel) {
  const abs = sandboxProjectAbsPath(rel);
  try {
    if (!await bash.fs.exists(abs)) return false;
    const st = await bash.fs.stat(abs);
    return st.isFile;
  } catch {
    return false;
  }
}
const todoWriteSchema = Type.Object({
  todos: Type.Array(
    Type.Object({
      id: Type.String({ description: 'Unique id (e.g. "1", "2").' }),
      task: Type.String({ description: "Task description." }),
      status: Type.Union([
        Type.Literal("pending"),
        Type.Literal("in_progress"),
        Type.Literal("completed")
      ])
    }),
    { description: "Full replacement todo list. Always write the complete current state." }
  )
});
function createTodoWriteTool(todoState, onTodos) {
  return {
    name: "todo_write",
    label: "todo_write",
    description: "Write or update your task list. Always provide the complete current state — full replacement. Todos survive context compaction.",
    promptSnippet: "Track task progress (survives context compaction)",
    parameters: todoWriteSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { todos } = piToolParams(params);
      todoState.current = todos;
      onTodos(todos);
      const summary = todos.map((t) => {
        const icon = t.status === "completed" ? "✓" : t.status === "in_progress" ? "●" : "○";
        return `${icon} ${t.task}`;
      }).join("\n");
      return {
        content: [{ type: "text", text: `Todo list updated:
${summary}` }],
        details: null
      };
    }
  };
}
const useSkillSchema = Type.Object({
  name: Type.String({
    description: 'Skill key — directory name under skills/ (matches <skill key="..."> in this tool description).'
  })
});
function createUseSkillTool(entries, onActivate) {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const rows = entries.map((e) => ({
    key: e.key,
    name: e.name,
    description: e.description
  }));
  const description = buildUseSkillToolDescription(rows);
  return {
    name: "use_skill",
    label: "use_skill",
    description,
    promptSnippet: "Load skill instructions from the skills catalog",
    parameters: useSkillSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { name } = piToolParams(params);
      const key = name.trim();
      const skill = byKey.get(key);
      if (!skill) {
        const available = [...byKey.keys()].sort().join(", ") || "(none)";
        return {
          content: [{ type: "text", text: `Unknown skill: ${key}. Available: ${available}` }],
          details: null
        };
      }
      onActivate({
        key: skill.key,
        name: skill.name,
        description: skill.description
      });
      const header = `# ${skill.name}

`;
      return {
        content: [{ type: "text", text: header + skill.bodyMarkdown }],
        details: null
      };
    }
  };
}
const validateJsSchema = Type.Object({
  path: Type.String({ description: 'Path of the JS file (e.g. "app.js").' })
});
function createValidateJsTool(bash) {
  return {
    name: "validate_js",
    label: "validate_js",
    description: "Check JS syntax with the Node parser. Prefer after substantive edits.",
    promptSnippet: "Check JS syntax with Node parser",
    parameters: validateJsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { path: path2 } = piToolParams(params);
      const content = await readProjectFile(bash, path2);
      if (content === void 0) {
        return {
          content: [{ type: "text", text: `File not found: ${path2}` }],
          details: null
        };
      }
      try {
        new Script(content, { filename: path2 });
        return {
          content: [{ type: "text", text: `${path2}: syntax OK` }],
          details: null
        };
      } catch (err) {
        const msg = normalizeError(err);
        return {
          content: [{ type: "text", text: `${path2}: ${msg}` }],
          details: null
        };
      }
    }
  };
}
const validateHtmlSchema = Type.Object({
  path: Type.String({ description: 'Path of the HTML file (e.g. "index.html").' })
});
function createValidateHtmlTool(bash) {
  return {
    name: "validate_html",
    label: "validate_html",
    description: "Structural checks for HTML (DOCTYPE, landmark tags, balanced script/style, local asset refs — inline CSS/JS allowed).",
    promptSnippet: "Structural checks for HTML (DOCTYPE, landmarks, assets)",
    parameters: validateHtmlSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { path: path2 } = piToolParams(params);
      const content = await readProjectFile(bash, path2);
      if (content === void 0) {
        return {
          content: [{ type: "text", text: `File not found: ${path2}` }],
          details: null
        };
      }
      const issues = await validateHtmlWorkspaceContent(content, path2, (rel) => hasProjectFile(bash, rel));
      const text = issues.length === 0 ? `${path2}: structure OK` : `${path2}: ${issues.length} issue(s)
${issues.map((i) => `- ${i}`).join("\n")}`;
      return {
        content: [{ type: "text", text }],
        details: null
      };
    }
  };
}
function normalizeLf(s) {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function strategy1LeadingWhitespaceOnly(fileContent, oldText) {
  const fileLines = fileContent.split("\n");
  const needleLines = oldText.split("\n");
  if (needleLines.length === 0) return null;
  const normalizedNeedle = needleLines.map((l) => l.replace(/^\s+/, ""));
  const matches = [];
  for (let i = 0; i <= fileLines.length - needleLines.length; i++) {
    let ok = true;
    for (let j = 0; j < needleLines.length; j++) {
      const fileLineNorm = fileLines[i + j].replace(/^\s+/, "");
      if (fileLineNorm !== normalizedNeedle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) matches.push(i);
  }
  if (matches.length !== 1) return null;
  const start = matches[0];
  return fileLines.slice(start, start + needleLines.length).join("\n");
}
function collapseWhitespace(s) {
  return s.replace(/\s+/g, " ").trim();
}
function strategy2CollapsedWhitespace(fileContent, oldText) {
  const target = collapseWhitespace(oldText);
  if (target === "") return null;
  const lines = fileContent.split("\n");
  const needleLineCount = oldText.split("\n").length;
  const minLen = Math.max(1, needleLineCount - 3);
  const maxLen = Math.min(lines.length, needleLineCount + 3);
  const matches = [];
  for (let s = 0; s < lines.length; s++) {
    for (let len = minLen; len <= maxLen && s + len <= lines.length; len++) {
      const chunk = lines.slice(s, s + len).join("\n");
      if (collapseWhitespace(chunk) === target) {
        matches.push(chunk);
      }
    }
  }
  const unique = [...new Set(matches)];
  return unique.length === 1 ? unique[0] : null;
}
function strategy3LineTrimAnchors(fileContent, oldText) {
  const fileLines = fileContent.split("\n");
  const needleLines = oldText.split("\n");
  if (needleLines.length === 0) return null;
  const L = needleLines.length;
  const blocks = [];
  for (let i = 0; i <= fileLines.length - L; i++) {
    let ok = true;
    for (let k = 0; k < L; k++) {
      if (fileLines[i + k].trim() !== needleLines[k].trim()) {
        ok = false;
        break;
      }
    }
    if (ok) {
      blocks.push(fileLines.slice(i, i + L).join("\n"));
    }
  }
  if (blocks.length !== 1) return null;
  return blocks[0];
}
function collapseAndLowercase(s) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
function strategy4CaseInsensitiveCollapsed(fileContent, oldText) {
  const fileLines = fileContent.split("\n");
  const needleLines = oldText.split("\n");
  if (needleLines.length === 0) return null;
  const L = needleLines.length;
  const normalizedNeedle = needleLines.map(collapseAndLowercase);
  const blocks = [];
  for (let i = 0; i <= fileLines.length - L; i++) {
    let ok = true;
    for (let k = 0; k < L; k++) {
      if (collapseAndLowercase(fileLines[i + k]) !== normalizedNeedle[k]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      blocks.push(fileLines.slice(i, i + L).join("\n"));
    }
  }
  if (blocks.length !== 1) return null;
  return blocks[0];
}
function strategy5AnchorLines(fileContent, oldText) {
  const fileLines = fileContent.split("\n");
  const needleLines = oldText.split("\n");
  if (needleLines.length < 3) return null;
  const firstNeedle = collapseAndLowercase(needleLines[0]);
  const lastNeedle = collapseAndLowercase(needleLines[needleLines.length - 1]);
  if (!firstNeedle || !lastNeedle) return null;
  const L = needleLines.length;
  const tolerance = 5;
  const blocks = [];
  for (let i = 0; i < fileLines.length; i++) {
    if (collapseAndLowercase(fileLines[i]) !== firstNeedle) continue;
    const minEnd = i + Math.max(L - tolerance, 2);
    const maxEnd = i + L + tolerance;
    for (let j = Math.min(minEnd, fileLines.length - 1); j < Math.min(maxEnd, fileLines.length); j++) {
      if (collapseAndLowercase(fileLines[j]) !== lastNeedle) continue;
      const span = j - i + 1;
      if (span >= L - tolerance && span <= L + tolerance) {
        blocks.push(fileLines.slice(i, j + 1).join("\n"));
      }
    }
  }
  if (blocks.length !== 1) return null;
  return blocks[0];
}
const STRATEGY_NAMES = [
  "strategy1LeadingWhitespaceOnly",
  "strategy2CollapsedWhitespace",
  "strategy3LineTrimAnchors",
  "strategy4CaseInsensitiveCollapsed",
  "strategy5AnchorLines"
];
const STRATEGIES = [
  strategy1LeadingWhitespaceOnly,
  strategy2CollapsedWhitespace,
  strategy3LineTrimAnchors,
  strategy4CaseInsensitiveCollapsed,
  strategy5AnchorLines
];
function attemptMatchCascade(fileContent, edits, diagnostics) {
  const file = normalizeLf(fileContent);
  const corrected = [];
  for (let ei = 0; ei < edits.length; ei++) {
    const e = edits[ei];
    const oldNorm = normalizeLf(e.oldText);
    const diag = {
      editIndex: ei,
      oldTextPreview: oldNorm.length > LOG_PREVIEW_SNIPPET_MAX ? `${oldNorm.slice(0, LOG_PREVIEW_SNIPPET_HEAD_CHARS)}…` : oldNorm,
      resolvedBy: null,
      strategiesAttempted: []
    };
    let fixed = null;
    for (let si = 0; si < STRATEGIES.length; si++) {
      diag.strategiesAttempted.push(STRATEGY_NAMES[si]);
      fixed = STRATEGIES[si](file, oldNorm);
      if (fixed && fixed !== e.oldText) {
        diag.resolvedBy = STRATEGY_NAMES[si];
        break;
      }
      fixed = null;
    }
    diagnostics?.push(diag);
    if (!fixed) {
      return null;
    }
    corrected.push({ oldText: fixed, newText: e.newText });
  }
  return corrected;
}
function normalizeEditToolParams(params) {
  if (!params || typeof params !== "object") return null;
  const p = params;
  const pathVal = typeof p.path === "string" ? p.path : "";
  const edits = Array.isArray(p.edits) ? [...p.edits] : [];
  if (typeof p.oldText === "string" && typeof p.newText === "string") {
    edits.push({ oldText: p.oldText, newText: p.newText });
  }
  if (edits.length === 0) return null;
  for (const e of edits) {
    if (typeof e.oldText !== "string" || typeof e.newText !== "string") return null;
  }
  return { path: pathVal, edits };
}
function isEditNotFoundError(message) {
  return /could not find/i.test(message);
}
const SANDBOX_TOOL_OVERRIDES = {
  read: {
    description: `Read UTF-8 text from a file in the in-memory project at ${SANDBOX_PROJECT_ROOT}. This workspace is text-only for tool purposes (no image attachments). Output is truncated to ${SANDBOX_READ_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`
  },
  write: {
    description: `Create or overwrite a UTF-8 text file under ${SANDBOX_PROJECT_ROOT}. Parent directories are created as needed. Use for **new files** or **complete file rewrites**; prefer **edit** for partial changes to existing files.`
  },
  edit: {
    description: `Apply exact search-and-replace edits to an existing file under ${SANDBOX_PROJECT_ROOT}. Each \`oldText\` must appear **exactly once** in the **original** file before edits are applied. CRITICAL: Include **at least 3 lines of surrounding context** in each \`oldText\` so it uniquely identifies one occurrence — e.g. the full CSS rule block (selector + braces), not a single property line when that value repeats. Prefer **edit** over bash/sed for file changes.`
  },
  ls: {
    description: `List directory contents in the virtual project at ${SANDBOX_PROJECT_ROOT}. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is truncated to ${SANDBOX_LS_MAX_ENTRIES} entries or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`
  },
  find: {
    description: `Search for files by glob pattern under the in-memory project at ${SANDBOX_PROJECT_ROOT}. Returns matching file paths relative to the search directory. There is no .gitignore in this sandbox — every generated file is visible. Output is truncated to ${SANDBOX_FIND_MAX_RESULTS} results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`
  },
  grep: {
    description: `Search file contents in the virtual project workspace using ripgrep-style search (just-bash \`rg\`). Returns matching lines with file paths and line numbers. Only the in-memory design files under ${SANDBOX_PROJECT_ROOT} exist — there is no .gitignore or host filesystem. Output is truncated to ${SANDBOX_GREP_DEFAULT_MATCH_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars.`
  }
};
function toProjectRelative(absPath) {
  if (!absPath.startsWith(`${SANDBOX_PROJECT_ROOT}/`)) return null;
  return absPath.slice(SANDBOX_PROJECT_ROOT.length + 1);
}
async function emitDesignFileIfNeeded(absPath, bash, onDesignFile) {
  const rel = toProjectRelative(absPath);
  if (!rel) return;
  try {
    const st = await bash.fs.stat(absPath);
    if (!st.isFile) return;
    const content = await bash.fs.readFile(absPath, "utf8");
    onDesignFile(rel, content);
  } catch {
  }
}
function resolveVirtualPath(relativeOrAbsolute, cwd) {
  const raw = (relativeOrAbsolute ?? ".").trim() || ".";
  if (path.posix.isAbsolute(raw)) {
    return path.posix.normalize(raw);
  }
  return path.posix.resolve(cwd, raw);
}
function shellSingleQuote(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
function createVirtualGrepTool(bash, sessionCwd) {
  const base = grepToolDefinition;
  return {
    ...base,
    ...SANDBOX_TOOL_OVERRIDES.grep,
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const { pattern, path: pathArg, glob: globPat, ignoreCase, literal, context, limit } = params;
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }
      const searchPath = resolveVirtualPath(pathArg, sessionCwd);
      try {
        await bash.fs.stat(searchPath);
      } catch {
        return {
          content: [{ type: "text", text: `Path not found: ${searchPath}` }],
          details: void 0
        };
      }
      const effectiveLimit = Math.max(1, limit ?? SANDBOX_GREP_DEFAULT_MATCH_LIMIT);
      const contextLines = context && context > 0 ? context : 0;
      const argv = ["rg", "-nH"];
      if (ignoreCase) argv.push("--ignore-case");
      if (literal) argv.push("--fixed-strings");
      if (contextLines > 0) argv.push("-C", String(contextLines));
      const g = globPat?.trim();
      if (g) {
        argv.push("--glob", shellSingleQuote(g));
      }
      argv.push(shellSingleQuote(pattern), shellSingleQuote(searchPath));
      const cmd = argv.join(" ");
      const result = await bash.exec(cmd, { signal: signal ?? void 0 });
      if (signal?.aborted) {
        throw new Error("Operation aborted");
      }
      if (result.exitCode !== 0 && result.exitCode !== 1) {
        const errText = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
        return {
          content: [
            {
              type: "text",
              text: errText || `rg failed with exit code ${result.exitCode}`
            }
          ],
          details: void 0
        };
      }
      const rawOut = (result.stdout ?? "").replace(/\r\n/g, "\n").trimEnd();
      const stderrTrim = (result.stderr ?? "").trim();
      if (result.exitCode === 1 && !rawOut && stderrTrim) {
        return {
          content: [{ type: "text", text: stderrTrim }],
          details: void 0
        };
      }
      if (!rawOut) {
        return {
          content: [{ type: "text", text: "No matches found" }],
          details: void 0
        };
      }
      const lines = rawOut.split("\n");
      const matchLineRe = /^(.+):(\d+):/;
      let matchCount = 0;
      let matchLimitReached = false;
      let linesTruncated = false;
      const kept = [];
      for (const line of lines) {
        const isMatch = matchLineRe.test(line);
        if (isMatch) {
          if (matchCount >= effectiveLimit) {
            matchLimitReached = true;
            break;
          }
          matchCount++;
        }
        const { text: truncated, wasTruncated } = truncateLine(line, GREP_MAX_LINE_LENGTH);
        if (wasTruncated) linesTruncated = true;
        kept.push(truncated);
      }
      let output = kept.join("\n");
      const truncation = truncateHead(output, { maxLines: Number.MAX_SAFE_INTEGER });
      output = truncation.content;
      const details = {};
      const notices = [];
      if (matchLimitReached) {
        notices.push(
          `${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`
        );
        details.matchLimitReached = effectiveLimit;
      }
      if (truncation.truncated) {
        notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
        details.truncation = truncation;
      }
      if (linesTruncated) {
        notices.push(
          `Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`
        );
        details.linesTruncated = true;
      }
      if (notices.length > 0) {
        output += `

[${notices.join(". ")}]`;
      }
      return {
        content: [{ type: "text", text: output }],
        details: Object.keys(details).length > 0 ? details : void 0
      };
    }
  };
}
function resolveSandboxPathForSession(relativeOrAbsolute, cwd) {
  return resolveVirtualPath(relativeOrAbsolute, cwd);
}
function createVirtualPiCodingTools(bash, onDesignFile) {
  const sessionCwd = SANDBOX_PROJECT_ROOT;
  const pathsSeenBeforeEdit = /* @__PURE__ */ new Set();
  const readInner = createReadToolDefinition(sessionCwd, {
    autoResizeImages: false,
    operations: {
      readFile: async (absolutePath) => {
        const text = await bash.fs.readFile(absolutePath, "utf8");
        return Buffer.from(text, "utf8");
      },
      access: async (absolutePath) => {
        const ok = await bash.fs.exists(absolutePath);
        if (!ok) throw new Error("ENOENT");
      }
    }
  });
  const read = {
    ...readInner,
    ...SANDBOX_TOOL_OVERRIDES.read,
    execute: async (toolCallId, params, signal, onUpdate, extCtx) => {
      const result = await readInner.execute(toolCallId, params, signal, onUpdate, extCtx);
      const rawPath = params != null && typeof params === "object" && "path" in params && typeof params.path === "string" ? params.path : "";
      if (rawPath) {
        pathsSeenBeforeEdit.add(resolveSandboxPathForSession(rawPath, sessionCwd));
      }
      return result;
    }
  };
  const writeInner = createWriteToolDefinition(sessionCwd, {
    operations: {
      mkdir: async (dir) => {
        await bash.fs.mkdir(dir, { recursive: true });
      },
      writeFile: async (absolutePath, content) => {
        await bash.fs.mkdir(path.posix.dirname(absolutePath), { recursive: true });
        await bash.fs.writeFile(absolutePath, content, "utf8");
        await emitDesignFileIfNeeded(absolutePath, bash, onDesignFile);
      }
    }
  });
  const write = {
    ...writeInner,
    ...SANDBOX_TOOL_OVERRIDES.write,
    execute: async (toolCallId, params, signal, onUpdate, extCtx) => {
      const result = await writeInner.execute(toolCallId, params, signal, onUpdate, extCtx);
      const rawPath = params != null && typeof params === "object" && "path" in params && typeof params.path === "string" ? params.path : "";
      if (rawPath) {
        pathsSeenBeforeEdit.add(resolveSandboxPathForSession(rawPath, sessionCwd));
      }
      return result;
    }
  };
  const editInner = createEditToolDefinition(sessionCwd, {
    operations: {
      readFile: async (absolutePath) => {
        const text = await bash.fs.readFile(absolutePath, "utf8");
        return Buffer.from(text, "utf8");
      },
      writeFile: async (absolutePath, content) => {
        await bash.fs.mkdir(path.posix.dirname(absolutePath), { recursive: true });
        await bash.fs.writeFile(absolutePath, content, "utf8");
        await emitDesignFileIfNeeded(absolutePath, bash, onDesignFile);
      },
      access: async (absolutePath) => {
        const ok = await bash.fs.exists(absolutePath);
        if (!ok) throw new Error("ENOENT");
      }
    }
  });
  const edit = {
    ...editInner,
    ...SANDBOX_TOOL_OVERRIDES.edit,
    execute: async (toolCallId, params, signal, onUpdate, extCtx) => {
      const rawPath = params != null && typeof params === "object" && "path" in params && typeof params.path === "string" ? params.path : "";
      const abs = resolveSandboxPathForSession(rawPath || ".", sessionCwd);
      const fileExists = await bash.fs.exists(abs);
      if (fileExists && !pathsSeenBeforeEdit.has(abs)) {
        throw new Error(
          `You must read "${rawPath}" before editing it. Use the read tool first to see the current file content.`
        );
      }
      try {
        const result = await editInner.execute(toolCallId, params, signal, onUpdate, extCtx);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!isEditNotFoundError(msg)) {
          throw err;
        }
        const normalized = normalizeEditToolParams(params);
        if (!normalized) {
          throw err;
        }
        let fileContent;
        try {
          fileContent = await bash.fs.readFile(abs, "utf8");
        } catch {
          throw err;
        }
        const diagnostics = [];
        const corrected = attemptMatchCascade(fileContent, normalized.edits, diagnostics);
        if (!corrected) {
          console.debug(
            "[edit-cascade] all strategies failed for",
            rawPath,
            JSON.stringify(diagnostics)
          );
          throw err;
        }
        console.debug(
          "[edit-cascade] resolved via cascade for",
          rawPath,
          JSON.stringify(diagnostics)
        );
        const retryParams = {
          path: normalized.path,
          edits: corrected
        };
        try {
          const result = await editInner.execute(
            toolCallId,
            retryParams,
            signal,
            onUpdate,
            extCtx
          );
          return result;
        } catch {
          throw err;
        }
      }
    }
  };
  const lsInner = createLsToolDefinition(sessionCwd, {
    operations: {
      exists: (absolutePath) => bash.fs.exists(absolutePath),
      stat: async (absolutePath) => {
        const st = await bash.fs.stat(absolutePath);
        return {
          isDirectory: () => st.isDirectory
        };
      },
      readdir: async (absolutePath) => bash.fs.readdir(absolutePath)
    }
  });
  const ls = {
    ...lsInner,
    ...SANDBOX_TOOL_OVERRIDES.ls,
    execute: async (toolCallId, params, signal, onUpdate, extCtx) => {
      const vfsPaths = bash.fs.getAllPaths();
      const pathArg = params != null && typeof params === "object" && "path" in params && typeof params.path === "string" ? params.path : "";
      const stray = vfsPaths.filter(
        (p) => p !== SANDBOX_PROJECT_ROOT && !p.startsWith(`${SANDBOX_PROJECT_ROOT}/`)
      );
      debugAgentIngest({
        hypothesisId: stray.length > 0 ? "H5" : "H4",
        location: "virtual-tools.ts:ls:enter",
        message: "virtual ls enter",
        data: {
          sandboxRoot: SANDBOX_PROJECT_ROOT,
          toolCallId,
          pathArg,
          vfsTotal: vfsPaths.length,
          strayCount: stray.length,
          straySample: stray.slice(0, 6)
        }
      });
      const t0 = Date.now();
      try {
        const result = await lsInner.execute(toolCallId, params, signal, onUpdate, extCtx);
        const first = result.content[0];
        const textLen = first && typeof first === "object" && first !== null && "text" in first ? String(first.text ?? "").length : 0;
        debugAgentIngest({
          hypothesisId: "H4",
          location: "virtual-tools.ts:ls:exit",
          message: "virtual ls exit",
          data: { toolCallId, durationMs: Date.now() - t0, textLen }
        });
        return result;
      } catch (err) {
        debugAgentIngest({
          hypothesisId: "H4",
          location: "virtual-tools.ts:ls:error",
          message: "virtual ls throw",
          data: { toolCallId, err: normalizeError(err) }
        });
        throw err;
      }
    }
  };
  const findInner = createFindToolDefinition(sessionCwd, {
    operations: {
      exists: (absolutePath) => bash.fs.exists(absolutePath),
      glob: async (pattern, searchPath, options) => {
        const limit = options.limit;
        const ignore = options.ignore ?? [];
        const prefix = searchPath.endsWith("/") ? searchPath : `${searchPath}/`;
        const allPaths = bash.fs.getAllPaths();
        const out = [];
        for (const abs of allPaths) {
          if (out.length >= limit) break;
          if (abs === searchPath) continue;
          if (!abs.startsWith(prefix)) continue;
          let st;
          try {
            st = await bash.fs.stat(abs);
          } catch {
            continue;
          }
          if (!st.isFile) continue;
          const rel = abs.startsWith(prefix) ? abs.slice(prefix.length) : abs;
          const ignored = ignore.some((ig) => minimatch(rel, ig, { dot: true }));
          if (ignored) continue;
          if (!minimatch(rel, pattern, { dot: true })) continue;
          out.push(abs);
        }
        return out;
      }
    }
  });
  const find = { ...findInner, ...SANDBOX_TOOL_OVERRIDES.find };
  const grep = createVirtualGrepTool(bash, sessionCwd);
  return [read, write, edit, ls, find, grep];
}
function buildAgentToolGroups(input) {
  return {
    virtualFileTools: createVirtualPiCodingTools(input.bash, input.onDesignFile),
    bashTool: createSandboxBashTool(input.bash, input.onDesignFile),
    appTools: [
      createTodoWriteTool(input.todoState, input.onTodos),
      createUseSkillTool(input.skillCatalog, input.onSkillActivated)
    ],
    validationTools: [
      createValidateJsTool(input.bash),
      createValidateHtmlTool(input.bash)
    ]
  };
}
function flattenAgentToolGroups(groups) {
  return [
    ...groups.virtualFileTools,
    groups.bashTool,
    ...groups.appTools,
    ...groups.validationTools
  ];
}
const toolArgsRecordSchema = z.record(z.string(), z.unknown());
const TOOL_PATH_ARG_KEYS = ["path", "file", "filePath", "target_file"];
function extractPiToolPathFromArguments(raw) {
  const parsed = toolArgsRecordSchema.safeParse(raw);
  if (!parsed.success) return void 0;
  const o = parsed.data;
  for (const key of TOOL_PATH_ARG_KEYS) {
    const v = o[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return void 0;
}
function parsePiToolExecutionArgs(_toolName, raw) {
  const parsed = toolArgsRecordSchema.safeParse(raw);
  if (!parsed.success) {
    return {};
  }
  const o = parsed.data;
  const path2 = typeof o.path === "string" ? o.path : void 0;
  const pattern = typeof o.pattern === "string" ? o.pattern : void 0;
  const key = typeof o.key === "string" ? o.key : void 0;
  const name = typeof o.name === "string" ? o.name : void 0;
  return { path: path2 ?? key ?? name, pattern };
}
function parseToolCallFromAssistantSlice(slice) {
  if (slice === null || typeof slice !== "object" || !("type" in slice)) {
    return { toolName: "tool" };
  }
  const type = slice.type;
  if (type !== "toolCall") {
    return { toolName: "tool" };
  }
  const obj = slice;
  const name = obj.name;
  const args = obj.arguments;
  const toolName = typeof name === "string" && name.length > 0 ? name : "tool";
  const argumentsObj = args !== null && typeof args === "object" && !Array.isArray(args) ? args : void 0;
  const toolPath = argumentsObj != null ? extractPiToolPathFromArguments(argumentsObj) : void 0;
  return { toolName, ...toolPath != null ? { toolPath } : {} };
}
function toolMetaFromPartialNarrowed(partial, contentIndex) {
  const slice = partial.content[contentIndex];
  return parseToolCallFromAssistantSlice(slice);
}
function extractToolPathFromAssistantPartial(partial, contentIndex) {
  return toolMetaFromPartialNarrowed(partial, contentIndex).toolPath;
}
function parsePiToolCallEnd(toolCall) {
  if (toolCall === null || typeof toolCall !== "object" || Array.isArray(toolCall)) {
    return null;
  }
  const o = toolCall;
  const name = o.name;
  const args = o.arguments;
  const out = {};
  if (typeof name === "string") out.name = name;
  if (args !== null && typeof args === "object" && !Array.isArray(args)) {
    out.arguments = args;
  }
  return out;
}
function toolPathFromNarrowedToolCall(tc) {
  return extractPiToolPathFromArguments(tc.arguments);
}
function parseUnknownArgsRecord(args) {
  if (args === null || args === void 0) return void 0;
  if (typeof args !== "object" || Array.isArray(args)) return void 0;
  return args;
}
function parseCompactionDetails(details) {
  if (details === null || typeof details !== "object" || Array.isArray(details)) return void 0;
  const d = details;
  const readFiles = d.readFiles;
  const modifiedFiles = d.modifiedFiles;
  const out = {};
  if (Array.isArray(readFiles) && readFiles.every((x) => typeof x === "string")) {
    out.readFiles = readFiles;
  }
  if (Array.isArray(modifiedFiles) && modifiedFiles.every((x) => typeof x === "string")) {
    out.modifiedFiles = modifiedFiles;
  }
  return Object.keys(out).length > 0 ? out : void 0;
}
function findLastAssistantMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && typeof m === "object" && !Array.isArray(m)) {
      const role = m.role;
      if (role === "assistant") return m;
    }
  }
  return void 0;
}
function lastAssistantHasAgentError(session) {
  return findLastAssistantMessage(session.agent.state.messages)?.stopReason === "error";
}
function safeBridgeEmit(ctx, event) {
  emitEvent(ctx.onEvent, event, {
    label: "[bridge]",
    onFail: ctx.onStreamDeliveryFailure
  });
}
function handleCompactionStart(ctx, event) {
  const reasonLabel = event.reason === "overflow" ? "overflow recovery" : event.reason === "threshold" ? "threshold" : "manual";
  safeBridgeEmit(ctx, { type: "progress", payload: `Compacting context (${reasonLabel})…` });
  safeBridgeEmit(
    ctx,
    ctx.trace("compaction", "Compacting context window", {
      phase: "building",
      detail: `reason=${event.reason}`
    })
  );
}
function handleAgentEnd(ctx, event) {
  if (event.type !== "agent_end") return;
  const messages = event.messages;
  const lastAssistant = findLastAssistantMessage(messages);
  if (!lastAssistant || lastAssistant.stopReason !== "error") return;
  const errMsg = lastAssistant.errorMessage?.trim() || "Model stream error";
  const traceRow = {
    id: crypto.randomUUID(),
    at: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "tool_failed",
    label: "Agent ended with model error",
    phase: "building",
    status: "error",
    detail: errMsg.slice(0, 512)
  };
  safeBridgeEmit(ctx, { type: "trace", trace: traceRow });
  safeBridgeEmit(ctx, { type: "error", payload: errMsg });
}
function handleCompactionEnd(ctx, event) {
  const result = event.result;
  const detailBits = [`reason=${event.reason}`];
  if (event.aborted) detailBits.push("aborted");
  if (event.willRetry) detailBits.push("willRetry");
  if (event.errorMessage) detailBits.push(`error=${event.errorMessage}`);
  if (result) {
    detailBits.push(`tokensBefore=${result.tokensBefore}`);
    detailBits.push(`summaryChars=${result.summary.length}`);
    const d = parseCompactionDetails(result.details);
    if (d?.modifiedFiles?.length) detailBits.push(`modifiedFiles=${d.modifiedFiles.length}`);
    if (d?.readFiles?.length) detailBits.push(`readFiles=${d.readFiles.length}`);
  }
  const rehydrationHint = "Rehydrate: use_skill for needed sandbox guides; use last todo_write / checkpoint lists; re-read key HTML/CSS/JS you were editing; grep if uncertain.";
  safeBridgeEmit(
    ctx,
    ctx.trace(
      "compaction",
      event.aborted ? "Context compaction aborted" : event.errorMessage ? "Context compaction finished with warning" : "Context compaction finished",
      {
        phase: "building",
        status: event.errorMessage ? "warning" : event.aborted ? "warning" : "success",
        detail: `${detailBits.join("; ")} — ${rehydrationHint}`
      }
    )
  );
}
const AGENTIC_PROGRESS_WORKING = "Agent working…";
const RUN_TRACE_LABEL_AGENT_WORKING = "Agent working";
function serializePiToolArgsForTrace(raw, maxChars = PI_TOOL_ARGS_TRACE_MAX_CHARS) {
  if (raw == null) return void 0;
  if (typeof raw !== "object") return void 0;
  try {
    return truncateUtf16WithSuffix(JSON.stringify(raw), maxChars);
  } catch {
    return void 0;
  }
}
function extractTextFromAgentToolResult(result) {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object" && result !== null && "message" in result) {
    const m = result.message;
    if (typeof m === "string") return m;
  }
  const r = result;
  if (!Array.isArray(r.content)) return "";
  const parts = [];
  for (const block of r.content) {
    if (block && typeof block === "object" && block.type === "text") {
      const t = block.text;
      if (typeof t === "string") parts.push(t);
    }
  }
  return parts.join("\n");
}
function serializePiToolResultForTrace(result, isError, maxChars = PI_TOOL_RESULT_TRACE_MAX_CHARS) {
  if (result == null) return isError ? "(no result)" : void 0;
  let text;
  if (isError) {
    if (result instanceof Error) {
      text = result.message || String(result);
    } else {
      text = extractTextFromAgentToolResult(result);
      if (!text) {
        try {
          text = typeof result === "object" ? JSON.stringify(result) : String(result);
        } catch {
          text = normalizeError(result);
        }
      }
    }
  } else {
    text = extractTextFromAgentToolResult(result);
  }
  const trimmed = text.trim();
  if (!trimmed) return isError ? "(empty result)" : void 0;
  return truncateUtf16WithSuffix(trimmed, maxChars);
}
function emitFirstTokenIfNeeded(ctx) {
  if (ctx.waitingForFirstToken.current) {
    ctx.waitingForFirstToken.current = false;
    safeBridgeEmit(
      ctx,
      ctx.trace("model_first_token", "First streamed model token received", {
        phase: "building",
        status: "success"
      })
    );
  }
}
function toolStartProgressPayload(toolName, path2, _pattern, command) {
  if (toolName === "bash") {
    const c = command ?? "";
    const short = c.length > LOG_PREVIEW_SNIPPET_MAX ? `${c.slice(0, LOG_PREVIEW_SNIPPET_HEAD_CHARS)}…` : c;
    return short ? `Running: ${short}` : "Running shell command…";
  }
  switch (toolName) {
    case "validate_js":
    case "validate_html":
      return `Validating ${path2 ?? "file"}…`;
    case "todo_write":
      return "Updating tasks…";
    case "use_skill":
      return path2 ? `Loading skill: ${path2}…` : "Loading skill…";
    default:
      return `Running ${toolName}…`;
  }
}
function bumpStreamActivity(ctx) {
  ctx.streamActivityAt.current = Date.now();
}
function syncPendingToolProbe(ctx, toolStartMs) {
  if (ctx.pendingToolCallsRef) ctx.pendingToolCallsRef.current = toolStartMs.size;
}
const STREAMING_TOOL_EMIT_INTERVAL_MS = 500;
function handleAssistantTextStreamDelta(ctx, rawDelta, kind) {
  if (!rawDelta) return;
  emitFirstTokenIfNeeded(ctx);
  const delta = stripProviderControlTokens(rawDelta);
  if (!delta) return;
  bumpStreamActivity(ctx);
  const logId = ctx.turnLogRef.current;
  if (logId) appendLlmCallResponse(logId, delta);
  if (kind === "activity") {
    safeBridgeEmit(ctx, { type: "activity", payload: delta });
    return;
  }
  safeBridgeEmit(ctx, {
    type: "thinking",
    payload: delta,
    turnId: ctx.modelTurnId.current
  });
}
function handleTurnStart(ctx, maps) {
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  ctx.modelTurnId.current += 1;
  safeBridgeEmit(ctx, { type: "progress", payload: AGENTIC_PROGRESS_WORKING });
  ctx.waitingForFirstToken.current = true;
  safeBridgeEmit(
    ctx,
    ctx.trace("model_turn_start", RUN_TRACE_LABEL_AGENT_WORKING, {
      phase: "building"
    })
  );
  debugAgentIngest({
    hypothesisId: "H1",
    location: "pi-bridge-tool-streaming.ts:turn_start",
    message: "model turn_start",
    data: {
      modelTurnId: ctx.modelTurnId.current,
      pendingToolCalls: toolStartMs.size
    }
  });
  syncPendingToolProbe(ctx, toolStartMs);
}
function handleMessageUpdate(ctx, maps, event) {
  const msg = event.assistantMessageEvent;
  const { streamingToolByIndex } = maps;
  switch (msg.type) {
    case "text_delta": {
      handleAssistantTextStreamDelta(ctx, msg.delta, "activity");
      return;
    }
    case "thinking_delta": {
      handleAssistantTextStreamDelta(ctx, msg.delta, "thinking");
      return;
    }
    case "toolcall_start": {
      emitFirstTokenIfNeeded(ctx);
      bumpStreamActivity(ctx);
      const idx = msg.contentIndex;
      const { toolName, toolPath } = toolMetaFromPartialNarrowed(msg.partial, idx);
      const now = Date.now();
      streamingToolByIndex.set(idx, {
        toolName,
        toolPath,
        streamedChars: 0,
        lastEmitAt: now
      });
      safeBridgeEmit(ctx, {
        type: "streaming_tool",
        toolName,
        streamedChars: 0,
        done: false,
        ...toolPath != null ? { toolPath } : {}
      });
      return;
    }
    case "toolcall_delta": {
      if (!msg.delta) return;
      emitFirstTokenIfNeeded(ctx);
      bumpStreamActivity(ctx);
      const idx = msg.contentIndex;
      let acc = streamingToolByIndex.get(idx);
      if (!acc) {
        const meta = toolMetaFromPartialNarrowed(msg.partial, idx);
        const now = Date.now();
        acc = {
          toolName: meta.toolName,
          toolPath: meta.toolPath,
          streamedChars: 0,
          lastEmitAt: now
        };
        streamingToolByIndex.set(idx, acc);
      }
      const pathFromPartial = extractToolPathFromAssistantPartial(msg.partial, idx);
      if (pathFromPartial && !acc.toolPath) acc.toolPath = pathFromPartial;
      acc.streamedChars += msg.delta.length;
      const t = Date.now();
      if (t - acc.lastEmitAt >= STREAMING_TOOL_EMIT_INTERVAL_MS) {
        acc.lastEmitAt = t;
        safeBridgeEmit(ctx, {
          type: "streaming_tool",
          toolName: acc.toolName,
          streamedChars: acc.streamedChars,
          done: false,
          ...acc.toolPath != null ? { toolPath: acc.toolPath } : {}
        });
      }
      return;
    }
    case "toolcall_end": {
      bumpStreamActivity(ctx);
      const idx = msg.contentIndex;
      const acc = streamingToolByIndex.get(idx);
      const tcNarrowed = parsePiToolCallEnd(msg.toolCall);
      const tc = tcNarrowed ?? {};
      const toolName = (typeof tc.name === "string" && tc.name.length > 0 ? tc.name : acc?.toolName) ?? "tool";
      const toolPath = toolPathFromNarrowedToolCall(tc) ?? acc?.toolPath;
      const streamedChars = acc?.streamedChars ?? 0;
      streamingToolByIndex.delete(idx);
      safeBridgeEmit(ctx, {
        type: "streaming_tool",
        toolName,
        streamedChars,
        done: true,
        ...toolPath != null ? { toolPath } : {}
      });
      return;
    }
    default:
      return;
  }
}
function handleToolExecutionStart(ctx, maps, event) {
  if (event.type !== "tool_execution_start") return;
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  const tn = event.toolName;
  const rawArgs = parseUnknownArgsRecord(event.args);
  const command = typeof rawArgs?.command === "string" ? rawArgs.command : void 0;
  const { path: path2, pattern } = parsePiToolExecutionArgs(tn, event.args);
  const reusedToolCallId = toolStartMs.has(event.toolCallId);
  toolStartMs.set(event.toolCallId, Date.now());
  debugAgentIngest({
    hypothesisId: "H2",
    location: "pi-bridge-tool-streaming.ts:tool_execution_start",
    message: "tool_execution_start",
    data: {
      toolCallId: event.toolCallId,
      toolName: tn,
      path: path2,
      pattern,
      reusedToolCallId,
      commandPreview: command != null && command.length > LOG_COMMAND_PREVIEW_MAX ? `${command.slice(0, LOG_COMMAND_PREVIEW_HEAD_CHARS)}…` : command,
      pendingAfter: toolStartMs.size
    }
  });
  syncPendingToolProbe(ctx, toolStartMs);
  ctx.toolPathByCallId.set(event.toolCallId, path2);
  const toolArgs = serializePiToolArgsForTrace(rawArgs);
  ctx.toolArgsByCallId.set(event.toolCallId, toolArgs);
  safeBridgeEmit(
    ctx,
    ctx.trace("tool_started", path2 ? `${tn} → ${path2}` : `Started ${tn}`, {
      phase: "building",
      toolName: tn,
      path: path2,
      ...toolArgs != null ? { toolArgs } : {}
    })
  );
  safeBridgeEmit(ctx, {
    type: "progress",
    payload: toolStartProgressPayload(tn, path2, pattern, command)
  });
}
function handleToolExecutionEnd(ctx, maps, event) {
  if (event.type !== "tool_execution_end") return;
  const { toolStartMs } = maps;
  bumpStreamActivity(ctx);
  const started = toolStartMs.get(event.toolCallId);
  const durationMs = started != null ? Date.now() - started : void 0;
  toolStartMs.delete(event.toolCallId);
  debugAgentIngest({
    hypothesisId: started == null ? "H3" : "H2",
    location: "pi-bridge-tool-streaming.ts:tool_execution_end",
    message: "tool_execution_end",
    data: {
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      isError: event.isError,
      durationMs,
      hadMatchedStart: started != null,
      orphanEnd: started == null,
      pendingAfter: toolStartMs.size
    }
  });
  syncPendingToolProbe(ctx, toolStartMs);
  const resultText = serializePiToolResultForTrace(event.result, event.isError);
  const traceResultFields = resultText != null ? { detail: resultText, toolResult: resultText } : {};
  if (event.isError) {
    const path2 = ctx.toolPathByCallId.get(event.toolCallId);
    const failedArgs = ctx.toolArgsByCallId.get(event.toolCallId);
    safeBridgeEmit(
      ctx,
      ctx.trace("tool_failed", `Tool failed: ${event.toolName}`, {
        phase: "building",
        toolName: event.toolName,
        path: path2,
        status: "error",
        ...traceResultFields,
        ...failedArgs != null ? { toolArgs: failedArgs } : {}
      })
    );
    safeBridgeEmit(ctx, {
      type: "progress",
      payload: `Tool failed: ${event.toolName}`
    });
  } else {
    const path2 = ctx.toolPathByCallId.get(event.toolCallId);
    safeBridgeEmit(
      ctx,
      ctx.trace("tool_finished", `Finished ${event.toolName}`, {
        phase: "building",
        toolName: event.toolName,
        path: path2,
        status: "success",
        ...traceResultFields
      })
    );
  }
  ctx.toolPathByCallId.delete(event.toolCallId);
  ctx.toolArgsByCallId.delete(event.toolCallId);
}
function subscribePiSessionBridge(session, ctx) {
  const maps = {
    toolStartMs: /* @__PURE__ */ new Map(),
    streamingToolByIndex: /* @__PURE__ */ new Map()
  };
  if (ctx.pendingToolCallsRef) ctx.pendingToolCallsRef.current = maps.toolStartMs.size;
  return session.subscribe((event) => {
    switch (event.type) {
      case "turn_start":
        handleTurnStart(ctx, maps);
        return;
      case "message_update":
        handleMessageUpdate(ctx, maps, event);
        return;
      case "tool_execution_start":
        handleToolExecutionStart(ctx, maps, event);
        return;
      case "tool_execution_end":
        handleToolExecutionEnd(ctx, maps, event);
        return;
      case "compaction_start":
        handleCompactionStart(ctx, event);
        return;
      case "compaction_end":
        handleCompactionEnd(ctx, event);
        return;
      case "agent_end":
        handleAgentEnd(ctx, event);
        return;
      case "message_start":
      case "message_end":
      case "turn_end":
        return;
      default:
        if (process.env.NODE_ENV !== "production") {
          console.debug("[bridge] unhandled Pi event type:", event.type);
        }
    }
  });
}
function createDesignerCompactionExtensionFactory(getCompactionFocus) {
  return (pi) => {
    pi.on("session_before_compact", async (event, ctx) => {
      const model = ctx.model;
      if (!model) return;
      let focus = "";
      try {
        focus = (await getCompactionFocus()).trim();
      } catch {
      }
      const pieces = [event.customInstructions?.trim(), focus].filter((s) => s && s.length > 0);
      const customInstructions = pieces.length > 0 ? pieces.join("\n\n") : void 0;
      if (!customInstructions) {
        return;
      }
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok || !auth.apiKey) {
        return;
      }
      try {
        const result = await compact(
          event.preparation,
          model,
          auth.apiKey,
          auth.headers,
          customInstructions,
          event.signal
        );
        return { compaction: result };
      } catch {
        return;
      }
    });
  };
}
function compactionReserveTokensForContextWindow(contextWindow) {
  return Math.max(24e3, Math.floor(contextWindow * 0.28));
}
async function createSandboxResourceLoader(options) {
  const systemPrompt = options.systemPrompt?.trim();
  const reserveTokens = compactionReserveTokensForContextWindow(options.contextWindow);
  const settingsManager = SettingsManager.inMemory({
    compaction: {
      enabled: true,
      reserveTokens,
      keepRecentTokens: 2e4
    }
  });
  const extensionFactories = [];
  if (options.getCompactionPromptBody) {
    extensionFactories.push(
      createDesignerCompactionExtensionFactory(options.getCompactionPromptBody)
    );
  }
  const loader = new DefaultResourceLoader({
    cwd: SANDBOX_PROJECT_ROOT,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    extensionFactories,
    systemPrompt: systemPrompt && systemPrompt.length > 0 ? systemPrompt : void 0
  });
  await loader.reload();
  return { resourceLoader: loader, settingsManager };
}
const APP_RETRYABLE_UPSTREAM_PATTERN = /upstream|5\d{2}|NaN|provider.*error|gateway/i;
function isAppRetryableUpstreamError(message) {
  if (!message?.trim()) return false;
  if (/insufficient credits|out of credits|credits are exhausted|402/i.test(message)) return false;
  return APP_RETRYABLE_UPSTREAM_PATTERN.test(message);
}
function sleepMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
const MAX_APP_UPSTREAM_RETRIES = 2;
async function runPromptWithUpstreamRetries(session, userPrompt, onEvent, trace) {
  await session.prompt(userPrompt, { expandPromptTemplates: false });
  let attempts = 0;
  while (attempts < MAX_APP_UPSTREAM_RETRIES) {
    const lastAssistant = findLastAssistantMessage(session.agent.state.messages);
    if (!lastAssistant || lastAssistant.stopReason !== "error") return;
    if (!isAppRetryableUpstreamError(lastAssistant.errorMessage)) return;
    if (session.retryAttempt !== 0) return;
    attempts += 1;
    await onEvent({
      type: "progress",
      payload: `Retrying after upstream error (attempt ${attempts}/${MAX_APP_UPSTREAM_RETRIES})…`
    });
    await onEvent(
      trace("compaction", `Retrying after upstream error (${attempts}/${MAX_APP_UPSTREAM_RETRIES})`, {
        phase: "building",
        status: "warning",
        detail: lastAssistant.errorMessage?.slice(0, 500)
      })
    );
    const msgs = session.agent.state.messages;
    if (msgs.length > 0 && msgs[msgs.length - 1].role === "assistant") {
      session.agent.replaceMessages(msgs.slice(0, -1));
    }
    await sleepMs(2e3 * 2 ** (attempts - 1));
    await session.agent.continue();
  }
}
const FALLBACK_CONTEXT_WINDOW_DEFAULT = 131072;
const IDLE_PROGRESS_GAP_SEC = 18;
const IDLE_CHECK_MS = 1e4;
const STALL_DEBUG_MS = 6e4;
function createTraceEvent(kind, label, extra = {}) {
  return {
    type: "trace",
    trace: {
      id: crypto.randomUUID(),
      at: (/* @__PURE__ */ new Date()).toISOString(),
      kind,
      label,
      status: "info",
      ...extra
    }
  };
}
async function emitSessionStart(params, onEvent) {
  const message = params.initialProgressMessage ?? "Starting agentic generation...";
  await onEvent({ type: "progress", payload: message });
  await onEvent(createTraceEvent("run_started", message, { phase: "building" }));
}
async function buildPiModelRuntime(params) {
  const registryCw = await getProviderModelContextWindow(params.providerId, params.modelId);
  const fallbackCw = params.providerId === "lmstudio" ? env.LM_STUDIO_CONTEXT_WINDOW : FALLBACK_CONTEXT_WINDOW_DEFAULT;
  const contextWindow = registryCw ?? fallbackCw;
  const model = buildModel(
    params.providerId,
    params.modelId,
    params.thinkingLevel,
    contextWindow
  );
  const authStorage = AuthStorage.inMemory();
  if (params.providerId === "lmstudio") {
    authStorage.setRuntimeApiKey("lmstudio", "local");
  }
  if (params.providerId === "openrouter" && env.OPENROUTER_API_KEY) {
    authStorage.setRuntimeApiKey("openrouter", env.OPENROUTER_API_KEY);
  }
  return { authStorage, contextWindow, model };
}
function createDesignFileEmitter(onEvent, trace) {
  let fileEventCount = 0;
  const emittedFilePaths = /* @__PURE__ */ new Set();
  return {
    emittedFilePaths,
    getFileEventCount: () => fileEventCount,
    onDesignFile: (path2, content) => {
      fileEventCount += 1;
      emittedFilePaths.add(path2);
      emitEvent(onEvent, { type: "file", path: path2, content });
      emitEvent(
        onEvent,
        trace("file_written", `Saved ${path2}`, {
          phase: "building",
          path: path2,
          status: "success"
        })
      );
    }
  };
}
async function createSandboxSessionResources(params, contextWindow) {
  const { getPromptBody: getPromptBodyFn } = await import("./prompt-resolution-BUm5Krki.js");
  return createSandboxResourceLoader({
    systemPrompt: params.systemPrompt.trim(),
    contextWindow,
    getCompactionPromptBody: () => getPromptBodyFn("agent-context-compaction")
  });
}
function startSessionHeartbeatTimers(input) {
  const idleTimer = setInterval(() => {
    if (input.params.signal?.aborted) return;
    const gapSec = Math.floor((Date.now() - input.streamActivityAt.current) / 1e3);
    if (gapSec < IDLE_PROGRESS_GAP_SEC) return;
    emitEvent(input.onEvent, {
      type: "progress",
      payload: `Still working… ${gapSec}s since last streamed output`
    });
  }, IDLE_CHECK_MS);
  const stallDebugTimer = setInterval(() => {
    if (input.params.signal?.aborted) return;
    const idleSec = Math.floor((Date.now() - input.streamActivityAt.current) / 1e3);
    const isRevision = !!input.params.compactionNote?.trim();
    debugAgentIngest({
      hypothesisId: "H6",
      location: "pi-agent-service.ts:stall_heartbeat",
      message: "agent session stall heartbeat",
      data: {
        idleSec,
        pendingToolCalls: input.pendingToolCallsRef.current,
        isRevision,
        userPromptChars: input.params.userPrompt.length,
        seedFileCount: input.params.seedFiles ? Object.keys(input.params.seedFiles).length : 0
      }
    });
  }, STALL_DEBUG_MS);
  return () => {
    clearInterval(idleTimer);
    clearInterval(stallDebugTimer);
  };
}
async function extractSessionResult(input) {
  const files = await extractDesignFiles(input.bash);
  const seedSnapshot = input.params.seedFiles;
  const hasRevisionSeed = !!seedSnapshot && Object.keys(seedSnapshot).length > 0;
  const outputVsSeed = hasRevisionSeed ? computeDesignFilesBeyondSeed(files, seedSnapshot) : files;
  if (env.isDev) {
    const seedCount = input.params.seedFiles ? Object.keys(input.params.seedFiles).length : 0;
    console.debug("[pi-agent] session complete", {
      correlationId: input.params.correlationId,
      filesExtracted: Object.keys(files).length,
      beyondSeedCount: Object.keys(outputVsSeed).length,
      fileNames: Object.keys(files),
      fileEventsEmitted: input.fileEventCount,
      hasSeed: !!input.params.seedFiles && Object.keys(input.params.seedFiles).length > 0,
      seedFileCount: seedCount,
      todoCount: input.todoState.current.length,
      aborted: !!input.params.signal?.aborted,
      provider: input.params.providerId,
      model: input.params.modelId,
      contextWindow: input.contextWindow
    });
  }
  if (Object.keys(outputVsSeed).length === 0 && !input.params.signal?.aborted) {
    if (!lastAssistantHasAgentError(input.session)) {
      if (env.isDev) {
        console.warn(
          "[pi-agent] agent produced no new or changed files vs seed (empty workspace or unchanged revision seed)"
        );
      }
      await input.onEvent({
        type: "error",
        payload: "Agent completed without creating design files in the sandbox. Try a model that supports tool use, or ensure the bash tool runs successfully."
      });
    }
    return null;
  }
  return {
    files,
    todos: [...input.todoState.current],
    emittedFilePaths: [...input.emittedFilePaths]
  };
}
async function runDesignAgentSession(params, onEvent) {
  const trace = createTraceEvent;
  await emitSessionStart(params, onEvent);
  const bash = createAgentBashSandbox({
    seedFiles: params.seedFiles
  });
  const todoState = { current: [] };
  const hasSeed = !!params.seedFiles && Object.keys(params.seedFiles).length > 0;
  const { authStorage, contextWindow, model } = await buildPiModelRuntime(params);
  const { emittedFilePaths, getFileEventCount, onDesignFile } = createDesignFileEmitter(onEvent, trace);
  const skillCatalog = params.skillCatalog ?? [];
  const toolGroups = buildAgentToolGroups({
    bash,
    todoState,
    skillCatalog,
    onDesignFile,
    onTodos: (todos) => {
      emitEvent(onEvent, { type: "todos", todos });
    },
    onSkillActivated: (payload) => {
      emitEvent(onEvent, {
        type: "skill_activated",
        key: payload.key,
        name: payload.name,
        description: payload.description
      });
    }
  });
  const customTools = flattenAgentToolGroups(toolGroups);
  const llmTurnLogRef = {};
  const { resourceLoader, settingsManager } = await createSandboxSessionResources(params, contextWindow);
  const { session, modelFallbackMessage } = await createAgentSession({
    authStorage,
    model,
    thinkingLevel: params.thinkingLevel ?? "medium",
    tools: [],
    customTools,
    sessionManager: SessionManager.inMemory(),
    cwd: SANDBOX_PROJECT_ROOT,
    settingsManager,
    resourceLoader
  });
  if (modelFallbackMessage && process.env.NODE_ENV !== "production") {
    console.warn("[pi-agent-service]", modelFallbackMessage);
  }
  const prevStream = session.agent.streamFn;
  session.agent.streamFn = wrapPiStreamWithLogging(prevStream, {
    providerId: params.providerId,
    modelId: params.modelId,
    source: mapSessionTypeToLlmLogSource(params.sessionType),
    phase: params.compactionNote?.trim() ? PI_LLM_LOG_PHASE.REVISION : PI_LLM_LOG_PHASE.AGENTIC_TURN,
    turnLogRef: llmTurnLogRef,
    correlationId: params.correlationId
  });
  const streamActivityAt = { current: Date.now() };
  const pendingToolCallsRef = { current: 0 };
  const subscribeCtx = {
    onEvent,
    trace,
    toolPathByCallId: /* @__PURE__ */ new Map(),
    toolArgsByCallId: /* @__PURE__ */ new Map(),
    waitingForFirstToken: { current: false },
    turnLogRef: llmTurnLogRef,
    streamActivityAt,
    modelTurnId: { current: 0 },
    pendingToolCallsRef,
    onStreamDeliveryFailure: () => session.agent.abort()
  };
  const unsubscribe = subscribePiSessionBridge(session, subscribeCtx);
  if (params.signal) {
    params.signal.addEventListener("abort", () => session.agent.abort());
  }
  const stopHeartbeatTimers = startSessionHeartbeatTimers({
    params,
    onEvent,
    streamActivityAt,
    pendingToolCallsRef
  });
  if (env.isDev) {
    const seedKeys = hasSeed ? Object.keys(params.seedFiles) : [];
    console.debug("[pi-agent] session start", {
      correlationId: params.correlationId,
      provider: params.providerId,
      model: params.modelId,
      contextWindow,
      seedFileCount: seedKeys.length,
      seedFilePaths: seedKeys.slice(0, 20),
      toolCount: customTools.length,
      userPromptChars: params.userPrompt.length,
      systemPromptChars: params.systemPrompt.length
    });
  }
  try {
    await runPromptWithUpstreamRetries(
      session,
      `${params.userPrompt}

[Workspace root: ${SANDBOX_PROJECT_ROOT} — use read, write, edit, ls, find, and grep for files; use bash for shell/commands.]`,
      onEvent,
      trace
    );
  } catch (err) {
    if (env.isDev) {
      console.error("[pi-agent] session.prompt failed", normalizeError(err), err);
    }
    await onEvent({ type: "error", payload: `Agent error: ${normalizeProviderError(err)}` });
    return null;
  } finally {
    stopHeartbeatTimers();
    unsubscribe();
  }
  return extractSessionResult({
    bash,
    params,
    session,
    todoState,
    emittedFilePaths,
    fileEventCount: getFileEventCount(),
    contextWindow,
    onEvent
  });
}
const DesignMdLintFindingSchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  message: z.string()
});
const DesignMdLintSummarySchema = z.object({
  errors: z.number().int().min(0),
  warnings: z.number().int().min(0),
  infos: z.number().int().min(0),
  findings: z.array(DesignMdLintFindingSchema).optional()
});
const DesignMdDocumentSchema = z.object({
  content: z.string(),
  sourceHash: z.string(),
  generatedAt: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  lint: DesignMdLintSummarySchema.optional(),
  error: z.string().optional()
});
const DomainDesignSystemContentSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  content: z.string(),
  images: z.array(ReferenceImageSchema),
  designMdDocument: DesignMdDocumentSchema.optional(),
  providerMigration: z.string().optional(),
  modelMigration: z.string().optional()
});
const WorkspaceSnapshotSchema = z.object({
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown())
});
const DomainHypothesisSchema = z.object({
  id: z.string(),
  incubatorId: z.string(),
  strategyId: z.string(),
  modelNodeIds: z.array(z.string()),
  designSystemNodeIds: z.array(z.string()),
  revisionEnabled: z.boolean().optional(),
  maxRevisionRounds: z.number().int().min(0).max(20).optional(),
  minOverallScore: z.union([z.number().min(0).max(5), z.null()]).optional(),
  placeholder: z.boolean()
});
const DomainModelProfileSchema = z.object({
  nodeId: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  title: z.string().optional(),
  thinkingLevel: ThinkingLevelSchema.optional(),
  thinking: ThinkingOverrideSchema.optional()
});
const HypothesisStrategySchema = z.object({
  id: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  rationale: z.string(),
  measurements: z.string(),
  dimensionValues: z.record(z.string(), z.string())
});
const HypothesisWorkspaceCoreObjectSchema = z.object({
  hypothesisNodeId: z.string().min(1),
  strategy: HypothesisStrategySchema.optional(),
  hypothesisStrategy: HypothesisStrategySchema.optional(),
  variantStrategy: HypothesisStrategySchema.optional(),
  spec: DesignSpecSchema,
  snapshot: WorkspaceSnapshotSchema,
  domainHypothesis: DomainHypothesisSchema.nullish(),
  modelProfiles: z.record(z.string(), DomainModelProfileSchema),
  designSystems: z.record(z.string(), DomainDesignSystemContentSchema),
  defaultIncubatorProvider: z.string().min(1)
});
function coerceStrategy(obj) {
  const strategy = obj.strategy ?? obj.hypothesisStrategy ?? obj.variantStrategy;
  if (!strategy) throw new Error("strategy is required");
  const { hypothesisStrategy, variantStrategy, ...rest } = obj;
  return { ...rest, strategy };
}
const HypothesisWorkspaceCoreWithStrategySchema = HypothesisWorkspaceCoreObjectSchema.refine(
  (obj) => Boolean(obj.strategy ?? obj.hypothesisStrategy ?? obj.variantStrategy),
  { message: "strategy is required" }
);
const HypothesisWorkspaceCoreSchema = HypothesisWorkspaceCoreWithStrategySchema.transform(coerceStrategy);
const PromptBundleRequestSchema = HypothesisWorkspaceCoreSchema;
const HypothesisGenerateRequestSchema = HypothesisWorkspaceCoreObjectSchema.extend({
  supportsVision: z.boolean().optional(),
  evaluatorProviderId: z.string().optional(),
  evaluatorModelId: z.string().optional(),
  agenticMaxRevisionRounds: z.number().int().min(0).max(20).optional(),
  agenticMinOverallScore: z.number().min(0).max(5).optional(),
  rubricWeights: z.object({
    design: z.number().finite().nonnegative().optional(),
    strategy: z.number().finite().nonnegative().optional(),
    implementation: z.number().finite().nonnegative().optional(),
    browser: z.number().finite().nonnegative().optional()
  }).strict().optional(),
  correlationId: z.string().min(1).max(200).optional()
}).refine(
  (obj) => Boolean(obj.strategy ?? obj.hypothesisStrategy ?? obj.variantStrategy),
  { message: "strategy is required" }
).transform(coerceStrategy);
export {
  HypothesisGenerateRequestSchema as H,
  PromptBundleRequestSchema as P,
  SSE_EVENT_NAMES as S,
  clampEvaluatorOptional as a,
  applyLockdownToHypothesisContext as b,
  clampProviderModel as c,
  buildAgenticSystemContext as d,
  emitSkillsLoadedEvents as e,
  runDesignAgentSession as f,
  acquireAgenticSlotOrReject as g,
  debugAgentIngest as h,
  releaseAgenticSlot as i,
  agenticOrchestratorEventToSse as j,
  HypothesisStrategySchema as k,
  getSystemPromptBody as l,
  makeRunTraceEvent as m,
  normalizeProviderError as n,
  getSkillBody as o,
  providerLogFields as p,
  resolveVirtualAssetPath as r
};
