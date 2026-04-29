import { z } from "zod";
import { r as resolveVirtualAssetPath, p as providerLogFields, d as buildAgenticSystemContext, e as emitSkillsLoadedEvents, f as runDesignAgentSession, g as acquireAgenticSlotOrReject, m as makeRunTraceEvent, h as debugAgentIngest, i as releaseAgenticSlot, n as normalizeProviderError, S as SSE_EVENT_NAMES, j as agenticOrchestratorEventToSse } from "./hypothesis-request-schemas-C0hkg4kC.js";
import { b as ThinkingOverrideSchema, T as ThinkingLevelSchema, r as resolveThinkingConfig } from "./thinking-defaults-BkNuccwq.js";
import { e as env } from "../[[...route]].js";
import { randomUUID } from "node:crypto";
import { n as normalizeError, g as getProvider } from "./registry-B7is6TUr.js";
import { E as EVAL_BUNDLE_MAX_CHARS, f as EVAL_FILE_MAX_CHARS, h as beginLlmCall, i as finalizeLlmCall, j as failLlmCall, s as setLlmCallWaitingStatus, k as EVAL_DEGRADED_MSG_MAX, R as REVISION_COMPILED_PROMPT_MAX } from "./log-store-BzjCnWkn.js";
import { E as EVALUATOR_RUBRIC_IDS, D as DEFAULT_RUBRIC_WEIGHTS } from "./evaluation-BqxRe2Wx.js";
import { getPromptBody } from "./prompt-resolution-BUm5Krki.js";
import { performance } from "node:perf_hooks";
import { createContext, Script } from "node:vm";
import { r as resolvePreviewEntryPath, c as createPreviewSession, e as encodeVirtualPathForUrl, d as deletePreviewSession } from "./preview-session-store-YT8vDwgJ.js";
import { chromium } from "playwright";
import { e as extractLlmJsonObjectSegment, p as parseJsonLenient } from "./extract-llm-json-jyDb1ube.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const GENERATION_MODE = {
  AGENTIC: "agentic"
};
const EvaluationContextObjectSchema = z.object({
  strategyName: z.string().optional(),
  hypothesis: z.string().optional(),
  rationale: z.string().optional(),
  measurements: z.string().optional(),
  dimensionValues: z.record(z.string(), z.string()).optional(),
  objectivesMetrics: z.string().optional(),
  designConstraints: z.string().optional(),
  designSystemSnapshot: z.string().optional(),
  outputFormat: z.string().optional()
});
const EvaluationContextSchema = EvaluationContextObjectSchema.nullish();
const RubricWeightsPartialSchema = z.object({
  design: z.number().finite().nonnegative().optional(),
  strategy: z.number().finite().nonnegative().optional(),
  implementation: z.number().finite().nonnegative().optional(),
  browser: z.number().finite().nonnegative().optional()
}).strict();
const GenerateModeSchema = z.union([z.literal("single"), z.literal("agentic")]).optional().default("agentic").transform(() => GENERATION_MODE.AGENTIC);
const GenerateStreamBodySchema = z.object({
  prompt: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  /** Client-issued id to correlate LLM log rows with a UI run (optional). */
  correlationId: z.string().min(1).max(200).optional(),
  supportsVision: z.boolean().optional(),
  mode: GenerateModeSchema,
  /** Legacy field — still accepted for back-compat; prefer `thinking`. */
  thinkingLevel: ThinkingLevelSchema.optional(),
  /** Per-request thinking override (level + budget). Server merges with task defaults. */
  thinking: ThinkingOverrideSchema.optional(),
  evaluationContext: EvaluationContextSchema,
  evaluatorProviderId: z.string().optional(),
  evaluatorModelId: z.string().optional(),
  agenticMaxRevisionRounds: z.number().int().min(0).max(20).optional(),
  agenticMinOverallScore: z.number().min(0).max(5).optional(),
  /** Per-rubric weights merged with defaults and renormalized on the server. */
  rubricWeights: RubricWeightsPartialSchema.optional()
});
function generateMissingEntryShell(files) {
  const fileList = Object.entries(files).map(
    ([path2, content]) => `<h3 style="margin:16px 0 4px;font-family:monospace;color:#555">${path2}</h3><pre style="background:#f5f5f5;padding:12px;border-radius:4px;overflow:auto;font-size:12px;margin:0">${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`
  ).join("\n");
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Files</title></head>
<body style="font-family:system-ui;padding:20px;color:#333">
  <h2 style="color:#888">No index.html found — available files:</h2>
  ${fileList}
</body>
</html>`;
}
function bundleVirtualFS(files) {
  const htmlKey = resolvePreviewEntryPath(files);
  let html = files[htmlKey];
  if (!html) return generateMissingEntryShell(files);
  const scriptSrcClose = new RegExp(
    `<script\\s+([^>]*)src=(["'])([^"']+)\\2([^>]*)><\/script>`,
    "gi"
  );
  html = html.replace(
    /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
    (match, href) => {
      if (/^(https?:)?\/\//i.test(href)) return match;
      const key = resolveVirtualAssetPath(href, htmlKey);
      if (!key) return match;
      const css = files[key];
      return css ? `<style>
${css}
</style>` : match;
    }
  );
  html = html.replace(scriptSrcClose, (match, before, _quote, src, after) => {
    if (/^(https?:)?\/\//i.test(String(src))) return match;
    const key = resolveVirtualAssetPath(String(src), htmlKey);
    if (!key) return match;
    const js = files[key];
    return js ? `<script ${before}${after}>
${js}
<\/script>` : match;
  });
  return html;
}
function truncateBlock(label, content) {
  if (content.length <= EVAL_FILE_MAX_CHARS) return `<file path="${label}">
${content}
</file>`;
  return `<file path="${label}">
${content.slice(0, EVAL_FILE_MAX_CHARS)}
…[truncated]
</file>`;
}
function buildEvaluatorUserContent(files, compiledPrompt, context, previewPageUrl) {
  let bundled = "";
  try {
    bundled = bundleVirtualFS(files);
  } catch (err) {
    const msg = normalizeError(err, "bundle failed");
    if (env.isDev) {
      console.warn("[eval:bundle]", msg, err);
    }
    bundled = `<!-- bundleVirtualFS failed: ${msg} -->
[bundle error]`;
  }
  if (bundled.length > EVAL_BUNDLE_MAX_CHARS) {
    bundled = bundled.slice(0, EVAL_BUNDLE_MAX_CHARS) + "\n…[truncated]";
  }
  const fileBlocks = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path2, content]) => truncateBlock(path2, content)).join("\n\n");
  const ctxParts = [];
  if (context?.strategyName) ctxParts.push(`<strategy_name>
${context.strategyName}
</strategy_name>`);
  if (context?.hypothesis) ctxParts.push(`<hypothesis_bet>
${context.hypothesis}
</hypothesis_bet>`);
  if (context?.rationale) ctxParts.push(`<rationale>
${context.rationale}
</rationale>`);
  if (context?.measurements) ctxParts.push(`<measurements_kpis>
${context.measurements}
</measurements_kpis>`);
  if (context?.dimensionValues && Object.keys(context.dimensionValues).length > 0) {
    ctxParts.push(
      `<dimension_values>
${Object.entries(context.dimensionValues).map(([k, v]) => `${k}: ${v}`).join("\n")}
</dimension_values>`
    );
  }
  if (context?.objectivesMetrics) {
    ctxParts.push(`<objectives_metrics>
${context.objectivesMetrics}
</objectives_metrics>`);
  }
  if (context?.designConstraints) {
    ctxParts.push(`<design_constraints>
${context.designConstraints}
</design_constraints>`);
  }
  if (context?.designSystemSnapshot) {
    ctxParts.push(`<design_system>
${context.designSystemSnapshot}
</design_system>`);
  }
  if (context?.outputFormat) {
    ctxParts.push(`<output_format>
${context.outputFormat}
</output_format>`);
  }
  return [
    "<instruction>Evaluate the artifact below. Return ONLY the JSON object specified in your system contract.</instruction>",
    "<compiled_generation_prompt>",
    compiledPrompt.length > EVAL_FILE_MAX_CHARS ? `${compiledPrompt.slice(0, EVAL_FILE_MAX_CHARS)}
…[truncated]` : compiledPrompt,
    "</compiled_generation_prompt>",
    ctxParts.length > 0 ? `<structured_context>
${ctxParts.join("\n\n")}
</structured_context>` : "",
    previewPageUrl ? `<preview_page_url>
${previewPageUrl}
</preview_page_url>` : "",
    "<source_files>",
    fileBlocks,
    "</source_files>",
    "<bundled_preview_html>",
    bundled,
    "</bundled_preview_html>"
  ].filter(Boolean).join("\n\n");
}
const evaluatorRubricIdZodSchema = z.enum(
  EVALUATOR_RUBRIC_IDS
);
const LLM_WAIT_PULSE_MS = 6e3;
const noopUpdater = () => {
};
function runWaitingPulse(logId, t0) {
  const tick = () => {
    const sec = Math.round((performance.now() - t0) / 1e3);
    setLlmCallWaitingStatus(logId, `Waiting for provider… (${sec}s)`);
  };
  const handle = setInterval(tick, LLM_WAIT_PULSE_MS);
  tick();
  return () => clearInterval(handle);
}
function usageLogFields(meta) {
  if (!meta) return {};
  const o = {};
  if (meta.promptTokens != null) o.promptTokens = meta.promptTokens;
  if (meta.completionTokens != null) o.completionTokens = meta.completionTokens;
  if (meta.totalTokens != null) o.totalTokens = meta.totalTokens;
  if (meta.reasoningTokens != null) o.reasoningTokens = meta.reasoningTokens;
  if (meta.cachedPromptTokens != null) o.cachedPromptTokens = meta.cachedPromptTokens;
  if (meta.costCredits != null) o.costCredits = meta.costCredits;
  if (meta.truncated) o.truncated = true;
  return o;
}
async function withLlmCallLifecycle(ctx, model, providerId, systemPrompt, userPrompt, signal, upd, run) {
  const t0 = performance.now();
  const pv = providerLogFields(providerId);
  const logId = beginLlmCall({
    source: ctx.source,
    phase: ctx.phase,
    model,
    ...pv,
    systemPrompt,
    userPrompt,
    response: "Waiting for provider…",
    ...ctx.correlationId ? { correlationId: ctx.correlationId } : {}
  });
  let settled = false;
  const onAbort = () => {
    if (settled) return;
    settled = true;
    failLlmCall(logId, "Aborted", Math.round(performance.now() - t0));
  };
  if (signal?.aborted) {
    onAbort();
    throw new DOMException("Aborted", "AbortError");
  }
  if (signal) signal.addEventListener("abort", onAbort);
  let stopPulse = runWaitingPulse(logId, t0);
  const onFirstStreamBody = () => {
    stopPulse();
    stopPulse = () => {
    };
  };
  try {
    const response = await run({
      logId,
      t0,
      sig: signal,
      onFirstStreamBody
    });
    if (signal) signal.removeEventListener("abort", onAbort);
    if (settled) throw new DOMException("Aborted", "AbortError");
    settled = true;
    finalizeLlmCall(logId, {
      response: response.raw,
      durationMs: Math.round(performance.now() - t0),
      ...usageLogFields(response.metadata)
    });
    return response;
  } catch (err) {
    if (signal) signal.removeEventListener("abort", onAbort);
    if (!settled) {
      settled = true;
      failLlmCall(logId, normalizeError(err), Math.round(performance.now() - t0));
    }
    throw err;
  } finally {
    stopPulse();
  }
}
function chatMessagesToLogFields(messages) {
  const sys = [];
  const usr = [];
  for (const m of messages) {
    const text = typeof m.content === "string" ? m.content : m.content.map((p) => p.type === "text" ? p.text : "[image]").join("\n");
    if (m.role === "system") sys.push(text);
    else if (m.role === "user") usr.push(text);
    else if (m.role === "assistant") usr.push(`[assistant]
${text}`);
  }
  return {
    systemPrompt: sys.join("\n\n") || "(no system message)",
    userPrompt: usr.join("\n\n") || "(no user message)"
  };
}
async function loggedGenerateChat(provider, providerId, messages, options, ctx) {
  const model = options.model ?? "";
  const { systemPrompt, userPrompt } = chatMessagesToLogFields(messages);
  const sig = ctx.signal ?? options.signal;
  const mergedOptions = { ...options, signal: sig };
  return withLlmCallLifecycle(
    ctx,
    model,
    providerId,
    systemPrompt,
    userPrompt,
    sig,
    noopUpdater,
    async () => provider.generateChat(messages, mergedOptions)
  );
}
const playwright = { "consoleErrors": { "score5": 0, "score3": 1, "score2": 2, "bulkPenalty": 4 }, "pageErrorMultiplier": 2, "visibleText": { "excellent": 80, "good": 30, "minimal": 10 }, "bodyLayout": { "minWidthStrong": 100, "minHeightStrong": 40 }, "screenshotJpegQuality": 85 };
const qa = { "interactive": { "score2MinTotal": 1, "score3MinTotal": 3, "score3MinAnchors": 2, "score3MinButtons": 1, "score4MinTotal": 6, "score4MinButtons": 2, "score4MinAnchors": 3, "score4MinNavs": 1, "score5MinTotal": 10, "score5MinButtons": 2, "score5MinForms": 1 }, "content": { "wordsT2": 20, "wordsT3": 60, "wordsT4": 120, "wordsT5": 200, "score3MinHeadings": 1, "score3MinParagraphs": 1, "score4MinHeadings": 2, "score4MinSections": 2, "score5MinHeadings": 2, "score5MinParagraphs": 3, "score5MinSections": 3 } };
const rawScoring = {
  playwright,
  qa
};
const intMin0 = z.number().int().min(0);
const BrowserEvalScoringFileSchema = z.object({
  playwright: z.object({
    consoleErrors: z.object({ score5: intMin0, score3: intMin0, score2: intMin0, bulkPenalty: intMin0 }).strict(),
    pageErrorMultiplier: intMin0,
    visibleText: z.object({ excellent: intMin0, good: intMin0, minimal: intMin0 }).strict(),
    bodyLayout: z.object({ minWidthStrong: intMin0, minHeightStrong: intMin0 }).strict(),
    screenshotJpegQuality: z.number().int().min(1).max(100)
  }).strict(),
  qa: z.object({
    interactive: z.object({
      score2MinTotal: intMin0,
      score3MinTotal: intMin0,
      score3MinAnchors: intMin0,
      score3MinButtons: intMin0,
      score4MinTotal: intMin0,
      score4MinButtons: intMin0,
      score4MinAnchors: intMin0,
      score4MinNavs: intMin0,
      score5MinTotal: intMin0,
      score5MinButtons: intMin0,
      score5MinForms: intMin0
    }).strict(),
    content: z.object({
      wordsT2: intMin0,
      wordsT3: intMin0,
      wordsT4: intMin0,
      wordsT5: intMin0,
      score3MinHeadings: intMin0,
      score3MinParagraphs: intMin0,
      score4MinHeadings: intMin0,
      score4MinSections: intMin0,
      score5MinHeadings: intMin0,
      score5MinParagraphs: intMin0,
      score5MinSections: intMin0
    }).strict()
  }).strict()
}).strict();
const _c = BrowserEvalScoringFileSchema.parse(rawScoring);
const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_5 = _c.playwright.consoleErrors.score5;
const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_3 = _c.playwright.consoleErrors.score3;
const PLAYWRIGHT_CONSOLE_ERRORS_SCORE_2 = _c.playwright.consoleErrors.score2;
const PLAYWRIGHT_CONSOLE_ERROR_BULK_PENALTY = _c.playwright.consoleErrors.bulkPenalty;
const PLAYWRIGHT_PAGE_ERROR_SCORE_MULTIPLIER = _c.playwright.pageErrorMultiplier;
const PLAYWRIGHT_VISIBLE_TEXT_EXCELLENT = _c.playwright.visibleText.excellent;
const PLAYWRIGHT_VISIBLE_TEXT_GOOD = _c.playwright.visibleText.good;
const PLAYWRIGHT_VISIBLE_TEXT_MINIMAL = _c.playwright.visibleText.minimal;
const PLAYWRIGHT_BODY_MIN_WIDTH_STRONG = _c.playwright.bodyLayout.minWidthStrong;
const PLAYWRIGHT_BODY_MIN_HEIGHT_STRONG = _c.playwright.bodyLayout.minHeightStrong;
const PLAYWRIGHT_SCREENSHOT_JPEG_QUALITY = _c.playwright.screenshotJpegQuality;
const QA_INTERACTIVE_SCORE2_MIN_TOTAL = _c.qa.interactive.score2MinTotal;
const QA_INTERACTIVE_SCORE3_MIN_TOTAL = _c.qa.interactive.score3MinTotal;
const QA_INTERACTIVE_SCORE3_MIN_ANCHORS = _c.qa.interactive.score3MinAnchors;
const QA_INTERACTIVE_SCORE3_MIN_BUTTONS = _c.qa.interactive.score3MinButtons;
const QA_INTERACTIVE_SCORE4_MIN_TOTAL = _c.qa.interactive.score4MinTotal;
const QA_INTERACTIVE_SCORE4_MIN_BUTTONS = _c.qa.interactive.score4MinButtons;
const QA_INTERACTIVE_SCORE4_MIN_ANCHORS = _c.qa.interactive.score4MinAnchors;
const QA_INTERACTIVE_SCORE4_MIN_NAVS = _c.qa.interactive.score4MinNavs;
const QA_INTERACTIVE_SCORE5_MIN_TOTAL = _c.qa.interactive.score5MinTotal;
const QA_INTERACTIVE_SCORE5_MIN_BUTTONS = _c.qa.interactive.score5MinButtons;
const QA_INTERACTIVE_SCORE5_MIN_FORMS = _c.qa.interactive.score5MinForms;
const QA_CONTENT_WORDS_T2 = _c.qa.content.wordsT2;
const QA_CONTENT_WORDS_T3 = _c.qa.content.wordsT3;
const QA_CONTENT_WORDS_T4 = _c.qa.content.wordsT4;
const QA_CONTENT_WORDS_T5 = _c.qa.content.wordsT5;
const QA_CONTENT_SCORE3_MIN_HEADINGS = _c.qa.content.score3MinHeadings;
const QA_CONTENT_SCORE3_MIN_PARAGRAPHS = _c.qa.content.score3MinParagraphs;
const QA_CONTENT_SCORE4_MIN_HEADINGS = _c.qa.content.score4MinHeadings;
const QA_CONTENT_SCORE4_MIN_SECTIONS = _c.qa.content.score4MinSections;
const QA_CONTENT_SCORE5_MIN_HEADINGS = _c.qa.content.score5MinHeadings;
const QA_CONTENT_SCORE5_MIN_PARAGRAPHS = _c.qa.content.score5MinParagraphs;
const QA_CONTENT_SCORE5_MIN_SECTIONS = _c.qa.content.score5MinSections;
function hasTag(html, tag) {
  return new RegExp(`<${tag}[\\s>]`, "i").test(html);
}
function countMatches(html, pattern) {
  return (html.match(pattern) ?? []).length;
}
function extractScriptBodies(html) {
  const bodies = [];
  const re = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && m[1].trim()) bodies.push(m[1]);
  }
  return bodies;
}
function extractExternalRefs(html) {
  const refs = [];
  const scriptRe = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    if (m[1]) refs.push({ src: m[1] });
  }
  const linkRe = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    if (m[1]) refs.push({ src: m[1] });
  }
  return refs;
}
const INLINE_SCRIPT_VM_TIMEOUT_MS = 2e3;
const MAX_INLINE_SCRIPTS_TO_RUN = 5;
const RUNTIME_ERROR_MSG_MAX_LEN = 200;
const MAX_CONSOLE_ERRORS_IN_REPORT = 3;
function checkPageStructure(html) {
  const issues = [];
  let score = 5;
  if (!/<!\s*DOCTYPE\s+html/i.test(html)) {
    issues.push("missing DOCTYPE");
    score -= 1;
  }
  if (!hasTag(html, "html")) {
    issues.push("no <html> tag");
    score -= 1;
  }
  if (!hasTag(html, "head")) {
    issues.push("no <head> tag");
    score -= 0.5;
  }
  if (!hasTag(html, "body")) {
    issues.push("no <body> tag");
    score -= 1;
  }
  const openTags = countMatches(html, /<[a-z][a-z0-9]*[\s>]/gi);
  const closeTags = countMatches(html, /<\/[a-z][a-z0-9]*>/gi);
  const imbalance = Math.abs(openTags - closeTags);
  if (imbalance > openTags * 0.3) {
    issues.push(`tag imbalance: ${openTags} open vs ${closeTags} close`);
    score -= 1;
  }
  return {
    score: Math.max(1, Math.round(score)),
    notes: issues.length > 0 ? issues.join("; ") : "HTML structure looks well-formed"
  };
}
function checkAssetIntegrity(html, files, htmlFilePath) {
  const refs = extractExternalRefs(html);
  if (refs.length === 0) {
    return { score: 5, notes: "No external asset references (all inlined)" };
  }
  const missing = [];
  const fileKeys = new Set(Object.keys(files));
  for (const ref of refs) {
    const raw = ref.src.trim();
    if (/^(https?:)/i.test(raw) || raw.startsWith("//")) continue;
    const resolved = resolveVirtualAssetPath(ref.src, htmlFilePath);
    if (resolved === void 0) continue;
    if (!fileKeys.has(resolved)) {
      missing.push(ref.src);
    }
  }
  if (missing.length === 0) {
    return { score: 5, notes: `All ${refs.length} asset reference(s) resolved` };
  }
  const score = Math.max(1, 5 - missing.length * 2);
  return {
    score,
    notes: `Missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` (+ ${missing.length - 3} more)` : ""}`
  };
}
function createDomElementStub() {
  const stub = {
    addEventListener: () => {
    },
    removeEventListener: () => {
    },
    dispatchEvent: () => true,
    setAttribute: () => {
    },
    getAttribute: () => null,
    hasAttribute: () => false,
    appendChild: (n) => n,
    removeChild: () => {
    },
    insertBefore: (n) => n,
    style: {},
    textContent: "",
    innerHTML: "",
    innerText: "",
    focus: () => {
    },
    blur: () => {
    },
    click: () => {
    },
    matches: () => false,
    closest: () => null,
    parentElement: null,
    parentNode: null,
    children: [],
    childNodes: [],
    nextElementSibling: null,
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 })
  };
  stub.querySelector = () => createDomElementStub();
  stub.querySelectorAll = () => createEmptyNodeList();
  stub.getElementById = () => createDomElementStub();
  return stub;
}
function createEmptyNodeList() {
  return {
    length: 0,
    forEach() {
    },
    item: () => null,
    *[Symbol.iterator]() {
    }
  };
}
function createBrowserQaSandboxDocument() {
  const elStub = createDomElementStub();
  const bodyStub = createDomElementStub();
  const headStub = createDomElementStub();
  const noop = () => {
  };
  const documentMock = {
    addEventListener(type, fn) {
      if (type === "DOMContentLoaded" && typeof fn === "function") {
        try {
          fn();
        } catch {
        }
      }
    },
    removeEventListener: noop,
    querySelector: () => elStub,
    querySelectorAll: () => createEmptyNodeList(),
    getElementById: () => elStub,
    createElement: () => createDomElementStub(),
    createTextNode: () => ({}),
    body: bodyStub,
    head: headStub,
    documentElement: elStub
  };
  return documentMock;
}
function checkJsRuntime(html) {
  const scripts = extractScriptBodies(html);
  if (scripts.length === 0) {
    return { score: 5, notes: "No inline scripts to execute", errors: [] };
  }
  const consoleErrors = [];
  const runtimeErrors = [];
  const documentMock = createBrowserQaSandboxDocument();
  const fireMaybe = (fn) => {
    if (typeof fn === "function") {
      try {
        fn();
      } catch {
      }
    }
  };
  const sandbox = createContext({
    document: documentMock,
    /** Global/window listeners (global object === window after self-reference below). */
    addEventListener(type, fn) {
      if (type === "load") fireMaybe(fn);
    },
    removeEventListener: () => {
    },
    navigator: { userAgent: "node-browser-qa" },
    location: { href: "about:blank", protocol: "http:", hostname: "localhost" },
    history: { pushState: () => {
    }, replaceState: () => {
    } },
    setTimeout: () => 0,
    setInterval: () => 0,
    clearTimeout: () => {
    },
    clearInterval: () => {
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {
    },
    fetch: () => Promise.reject(new Error("fetch not available in QA sandbox")),
    console: {
      log: () => {
      },
      info: () => {
      },
      debug: () => {
      },
      warn: () => {
      },
      error: (...args) => {
        consoleErrors.push(args.map(String).join(" "));
      }
    },
    URL: typeof URL !== "undefined" ? URL : void 0,
    parseInt,
    parseFloat,
    JSON,
    Math,
    Date,
    Array,
    Object,
    Promise,
    RegExp,
    Error,
    TypeError,
    undefined: void 0,
    NaN: NaN,
    Infinity: Infinity,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent
  });
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  let scriptScore = 5;
  for (const src of scripts.slice(0, MAX_INLINE_SCRIPTS_TO_RUN)) {
    try {
      new Script(src).runInContext(sandbox, { timeout: INLINE_SCRIPT_VM_TIMEOUT_MS });
    } catch (err) {
      const msg = normalizeError(err);
      if (msg.includes("fetch not available") || msg.includes("is not a constructor") || msg.includes("CustomEvent") || msg.includes("ResizeObserver") || msg.includes("MutationObserver") || msg.includes("IntersectionObserver") || msg.includes("cancelAnimationFrame")) {
        continue;
      }
      runtimeErrors.push(msg.slice(0, RUNTIME_ERROR_MSG_MAX_LEN));
      scriptScore -= 1.5;
    }
  }
  const allErrors = [...runtimeErrors, ...consoleErrors.slice(0, MAX_CONSOLE_ERRORS_IN_REPORT)];
  const score = Math.max(1, Math.round(scriptScore));
  if (allErrors.length === 0) {
    return { score: 5, notes: `${scripts.length} script(s) executed without errors`, errors: [] };
  }
  return {
    score,
    notes: `${runtimeErrors.length} runtime error(s), ${consoleErrors.length} console.error(s)`,
    errors: allErrors
  };
}
function checkInteractiveElements(html) {
  const buttons = countMatches(html, /<button[\s>]/gi);
  const anchors = countMatches(html, /<a[\s>]/gi);
  const inputs = countMatches(html, /<input[\s>]/gi);
  const forms = countMatches(html, /<form[\s>]/gi);
  const onclicks = countMatches(html, /onclick=/gi);
  const total = buttons + anchors + inputs + forms + onclicks;
  const navs = countMatches(html, /<nav[\s>]/gi);
  let score = 1;
  if (total >= QA_INTERACTIVE_SCORE2_MIN_TOTAL) score = 2;
  if (total >= QA_INTERACTIVE_SCORE3_MIN_TOTAL || anchors >= QA_INTERACTIVE_SCORE3_MIN_ANCHORS && buttons >= QA_INTERACTIVE_SCORE3_MIN_BUTTONS) {
    score = 3;
  }
  if (total >= QA_INTERACTIVE_SCORE4_MIN_TOTAL || buttons >= QA_INTERACTIVE_SCORE4_MIN_BUTTONS && (anchors >= QA_INTERACTIVE_SCORE4_MIN_ANCHORS || navs >= QA_INTERACTIVE_SCORE4_MIN_NAVS)) {
    score = 4;
  }
  if (total >= QA_INTERACTIVE_SCORE5_MIN_TOTAL && (buttons >= QA_INTERACTIVE_SCORE5_MIN_BUTTONS || forms >= QA_INTERACTIVE_SCORE5_MIN_FORMS)) {
    score = 5;
  }
  const parts = [];
  if (buttons > 0) parts.push(`${buttons} button(s)`);
  if (anchors > 0) parts.push(`${anchors} link(s)`);
  if (inputs > 0) parts.push(`${inputs} input(s)`);
  if (forms > 0) parts.push(`${forms} form(s)`);
  if (navs > 0) parts.push(`${navs} nav region(s)`);
  return {
    score,
    notes: parts.length > 0 ? parts.join(", ") : "No interactive elements found"
  };
}
function checkContentPresence(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch?.[1] ?? html;
  const stripped = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = stripped ? stripped.split(/\s+/).filter((w) => w.length > 2).length : 0;
  const headings = countMatches(html, /<h[1-6][\s>]/gi);
  const paragraphs = countMatches(html, /<p[\s>]/gi);
  const sections = countMatches(html, /<(section|article|main|header|footer)[\s>]/gi);
  let score = 1;
  if (wordCount >= QA_CONTENT_WORDS_T2) score = 2;
  if (wordCount >= QA_CONTENT_WORDS_T3 || headings >= QA_CONTENT_SCORE3_MIN_HEADINGS && paragraphs >= QA_CONTENT_SCORE3_MIN_PARAGRAPHS) {
    score = 3;
  }
  if (wordCount >= QA_CONTENT_WORDS_T4 && (headings >= QA_CONTENT_SCORE4_MIN_HEADINGS || sections >= QA_CONTENT_SCORE4_MIN_SECTIONS)) {
    score = 4;
  }
  if (wordCount >= QA_CONTENT_WORDS_T5 && headings >= QA_CONTENT_SCORE5_MIN_HEADINGS && (paragraphs >= QA_CONTENT_SCORE5_MIN_PARAGRAPHS || sections >= QA_CONTENT_SCORE5_MIN_SECTIONS)) {
    score = 5;
  }
  return {
    score,
    notes: `≈${wordCount} words, ${headings} heading(s), ${paragraphs} paragraph(s), ${sections} section(s)`
  };
}
function runBrowserQA(input) {
  let bundledHtml;
  try {
    bundledHtml = bundleVirtualFS(input.files);
  } catch {
    bundledHtml = Object.values(input.files).find((v) => /<html/i.test(v)) ?? "";
  }
  const htmlPaths = Object.keys(input.files).filter((k) => k.endsWith(".html"));
  const entryKey = resolvePreviewEntryPath(input.files);
  const entryHtml = input.files[entryKey] ?? bundledHtml;
  const scores = {};
  const findings = [];
  const hardFails = [];
  const structure = checkPageStructure(entryHtml);
  scores.page_structure = structure;
  if (structure.score <= 2) {
    findings.push({ severity: "high", summary: "Malformed HTML structure", detail: structure.notes });
  }
  let assets = checkAssetIntegrity(bundledHtml, input.files, entryKey);
  for (const p of htmlPaths) {
    const a = checkAssetIntegrity(input.files[p], input.files, p);
    if (a.score < assets.score) assets = a;
  }
  scores.asset_integrity = assets;
  if (assets.score < 5) {
    findings.push({ severity: "high", summary: "Missing asset references", detail: assets.notes });
    if (assets.score <= 2) {
      hardFails.push({ code: "missing_assets", message: assets.notes });
    }
  }
  const runtime = checkJsRuntime(bundledHtml);
  scores.js_runtime = { score: runtime.score, notes: runtime.notes };
  if (runtime.errors.length > 0) {
    for (const err of runtime.errors.slice(0, 3)) {
      findings.push({
        severity: runtime.score <= 2 ? "high" : "medium",
        summary: "JS runtime error",
        detail: err
      });
    }
    if (runtime.score <= 1) {
      hardFails.push({ code: "js_execution_failure", message: runtime.errors[0] ?? "script failed" });
    }
  }
  let interactive = checkInteractiveElements(bundledHtml);
  for (const p of htmlPaths) {
    const i = checkInteractiveElements(input.files[p]);
    if (i.score > interactive.score) interactive = i;
  }
  scores.interactive_elems = interactive;
  if (interactive.score <= 1) {
    findings.push({ severity: "medium", summary: "No interactive elements found", detail: interactive.notes });
  }
  let content = checkContentPresence(bundledHtml);
  for (const p of htmlPaths) {
    const c = checkContentPresence(input.files[p]);
    if (c.score > content.score) content = c;
  }
  scores.content_presence = content;
  if (content.score <= 1) {
    findings.push({ severity: "high", summary: "Page appears empty or minimal", detail: content.notes });
    hardFails.push({ code: "empty_page", message: content.notes });
  }
  return { rubric: "browser", scores, findings, hardFails };
}
const playwrightDomMetricsSchema = z.object({
  textLen: z.number(),
  bodyW: z.number(),
  bodyH: z.number(),
  brokenImages: z.number()
});
const PLAYWRIGHT_EVAL_SCRIPT = `(() => {
  const body = document.body;
  const text = (body?.innerText ?? '').trim();
  const rect = body?.getBoundingClientRect();
  const imgs = Array.from(document.images);
  const broken = imgs.filter((i) => i.naturalWidth === 0 && i.naturalHeight === 0).length;
  return {
    textLen: text.length,
    bodyW: rect ? rect.width : 0,
    bodyH: rect ? rect.height : 0,
    brokenImages: broken,
  };
})()`;
function parsePlaywrightDomMetrics(raw) {
  const r = playwrightDomMetricsSchema.safeParse(raw);
  if (r.success) return r.data;
  return { textLen: 0, bodyW: 0, bodyH: 0, brokenImages: 0 };
}
function scoreVisibleTextLength(textLen) {
  if (textLen >= PLAYWRIGHT_VISIBLE_TEXT_EXCELLENT) return 5;
  if (textLen >= PLAYWRIGHT_VISIBLE_TEXT_GOOD) return 3;
  if (textLen >= PLAYWRIGHT_VISIBLE_TEXT_MINIMAL) return 2;
  return 1;
}
function scoreBodyLayout(bodyW, bodyH) {
  if (bodyW > PLAYWRIGHT_BODY_MIN_WIDTH_STRONG && bodyH > PLAYWRIGHT_BODY_MIN_HEIGHT_STRONG) return 5;
  if (bodyW > 0 && bodyH > 0) return 3;
  return 1;
}
function scorePlaywrightConsoleErrors(errorCount) {
  if (errorCount === PLAYWRIGHT_CONSOLE_ERRORS_SCORE_5) return 5;
  if (errorCount === PLAYWRIGHT_CONSOLE_ERRORS_SCORE_3) return 3;
  if (errorCount === PLAYWRIGHT_CONSOLE_ERRORS_SCORE_2) return 2;
  return Math.max(1, 5 - PLAYWRIGHT_CONSOLE_ERROR_BULK_PENALTY);
}
const SCREENSHOT_MAX_BASE64 = 6e5;
const FONTS_READY_TIMEOUT_MS = 8e3;
const NETWORK_IDLE_AFTER_SET_CONTENT_MS = 1e4;
function skipReport(reason, message) {
  return {
    rubric: "browser",
    scores: {},
    findings: [],
    hardFails: [],
    playwrightSkipped: { reason, message: message.slice(0, 800) }
  };
}
async function settlePageForEval(page) {
  await page.evaluate(
    `(() => Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, ${FONTS_READY_TIMEOUT_MS})),
      ]))()`
  ).catch((err) => {
    console.warn("[playwright-eval] document.fonts.ready", normalizeError(err));
  });
  await page.waitForFunction(`() => (document.body?.innerText ?? '').trim().length >= 10`, {
    timeout: 4500
  }).catch((err) => {
    console.warn("[playwright-eval] settlePageForEval: minimal text timeout", normalizeError(err));
  });
  await page.evaluate(`(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }))()`);
}
async function loadPageForScreenshot(page, bundled, previewPageUrl) {
  if (previewPageUrl) {
    await page.goto(previewPageUrl, { waitUntil: "networkidle", timeout: 25e3 });
  } else {
    await page.setContent(bundled, { waitUntil: "load", timeout: 2e4 });
    await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_AFTER_SET_CONTENT_MS }).catch(() => {
    });
  }
}
async function runBrowserPlaywrightEval(input) {
  let bundled;
  if (input.previewPageUrl) {
    bundled = "<html><body></body></html>";
  } else {
    try {
      bundled = bundleVirtualFS(input.files);
    } catch (err) {
      console.warn(
        "[playwright-eval] bundleVirtualFS failed; using fallback HTML slice",
        normalizeError(err)
      );
      bundled = Object.values(input.files).find((v) => /<html/i.test(v)) ?? "<html><body></body></html>";
    }
  }
  const pageErrors = [];
  const consoleErrors = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    return skipReport("browser_unavailable", `Chromium launch failed: ${normalizeError(err)}`);
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await loadPageForScreenshot(page, bundled, input.previewPageUrl);
    await settlePageForEval(page);
    const metrics = parsePlaywrightDomMetrics(await page.evaluate(PLAYWRIGHT_EVAL_SCRIPT));
    let artifacts;
    try {
      const buf = await page.screenshot({
        type: "jpeg",
        quality: PLAYWRIGHT_SCREENSHOT_JPEG_QUALITY,
        fullPage: false
      });
      const base64 = buf.toString("base64");
      if (base64.length <= SCREENSHOT_MAX_BASE64) {
        artifacts = {
          browserScreenshot: { mediaType: "image/jpeg", base64 }
        };
      }
    } catch {
    }
    const scores = {
      playwright_render: {
        score: pageErrors.length === 0 ? 5 : Math.max(1, 5 - pageErrors.length * PLAYWRIGHT_PAGE_ERROR_SCORE_MULTIPLIER),
        notes: pageErrors.length === 0 ? "Page loaded without uncaught exceptions" : pageErrors.slice(0, 2).join("; ")
      },
      playwright_console: {
        score: scorePlaywrightConsoleErrors(consoleErrors.length),
        notes: consoleErrors.length === 0 ? "No console errors" : consoleErrors.slice(0, 3).join("; ")
      },
      playwright_visible_text: {
        score: scoreVisibleTextLength(metrics.textLen),
        notes: `Visible text length ≈ ${metrics.textLen} chars`
      },
      playwright_layout: {
        score: scoreBodyLayout(metrics.bodyW, metrics.bodyH),
        notes: `Body box ${Math.round(metrics.bodyW)}×${Math.round(metrics.bodyH)}`
      },
      playwright_images: {
        score: metrics.brokenImages === 0 ? 5 : Math.max(1, 5 - metrics.brokenImages * PLAYWRIGHT_PAGE_ERROR_SCORE_MULTIPLIER),
        notes: metrics.brokenImages === 0 ? "No broken images detected" : `${metrics.brokenImages} image(s) appear broken (0×0)`
      }
    };
    const findings = [];
    const hardFails = [];
    if (pageErrors.length > 0) {
      findings.push({
        severity: "high",
        summary: "Uncaught page errors in headless browser",
        detail: pageErrors[0] ?? ""
      });
      hardFails.push({
        code: "playwright_page_error",
        message: (pageErrors[0] ?? "page error").slice(0, 400)
      });
    }
    if (metrics.textLen < 1) {
      hardFails.push({
        code: "playwright_empty_visible",
        message: "Rendered page has no visible text"
      });
    } else if (metrics.textLen < 10) {
      findings.push({
        severity: "medium",
        summary: "Very little visible text after load",
        detail: `innerText length ≈ ${metrics.textLen} (may be slow hydration or sparse UI)`
      });
    }
    return { rubric: "browser", scores, findings, hardFails, artifacts };
  } catch (err) {
    return skipReport("eval_error", normalizeError(err));
  } finally {
    await browser.close().catch(() => {
    });
  }
}
function mergeBrowserEvalReports(preflight, playwright2) {
  return {
    rubric: "browser",
    scores: { ...preflight.scores, ...playwright2.scores },
    findings: [...preflight.findings, ...playwright2.findings],
    hardFails: [...preflight.hardFails, ...playwright2.hardFails],
    artifacts: playwright2.artifacts ?? preflight.artifacts
  };
}
function mergePreflightWithPlaywright(preflight, playwright2) {
  if (playwright2.playwrightSkipped) {
    const summary = playwright2.playwrightSkipped.reason === "browser_unavailable" ? "Headless browser unavailable — VM preflight only" : "Headless browser eval failed — VM preflight only";
    return {
      ...preflight,
      findings: [
        ...preflight.findings,
        {
          severity: "medium",
          summary,
          detail: playwright2.playwrightSkipped.message
        }
      ]
    };
  }
  return mergeBrowserEvalReports(preflight, playwright2);
}
const criterionSchema = z.object({
  score: z.number(),
  notes: z.string()
});
const browserScreenshotArtifactSchema = z.object({
  mediaType: z.enum(["image/jpeg", "image/png"]),
  base64: z.string()
});
const evaluatorWorkerReportSchema = z.object({
  rubric: evaluatorRubricIdZodSchema,
  scores: z.record(z.string(), criterionSchema),
  findings: z.array(
    z.object({
      severity: z.enum(["high", "medium", "low"]),
      summary: z.string(),
      detail: z.string()
    })
  ),
  hardFails: z.array(
    z.object({
      code: z.string(),
      message: z.string()
    })
  ),
  playwrightSkipped: z.object({
    reason: z.enum(["browser_unavailable", "eval_error"]),
    message: z.string()
  }).optional(),
  artifacts: z.object({
    browserScreenshot: browserScreenshotArtifactSchema.optional()
  }).optional()
});
function coerceToArray(v, isSingleItem) {
  if (v === void 0 || v === null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "object") {
    const o = v;
    if (isSingleItem(o)) return [v];
    return Object.values(o);
  }
  return [];
}
function coerceFindingLikeArray(v) {
  return coerceToArray(
    v,
    (o) => typeof o.severity === "string" && typeof o.summary === "string" && typeof o.detail === "string"
  );
}
function coerceHardFailLikeArray(v) {
  return coerceToArray(v, (o) => typeof o.code === "string" && typeof o.message === "string");
}
function normalizeEvaluatorWorkerPayload(parsed) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }
  const root = { ...parsed };
  const scoresRaw = root.scores;
  if (scoresRaw !== null && typeof scoresRaw === "object" && !Array.isArray(scoresRaw)) {
    const scores = { ...scoresRaw };
    let mutated = false;
    if ("findings" in scores) {
      const nested = scores.findings;
      const hoisted = Array.isArray(nested) ? nested : coerceFindingLikeArray(nested);
      delete scores.findings;
      mutated = true;
      const top = coerceFindingLikeArray(root.findings);
      root.findings = [...top, ...hoisted];
    }
    if ("hardFails" in scores) {
      const nested = scores.hardFails;
      const hoisted = Array.isArray(nested) ? nested : coerceHardFailLikeArray(nested);
      delete scores.hardFails;
      mutated = true;
      const top = coerceHardFailLikeArray(root.hardFails);
      root.hardFails = [...top, ...hoisted];
    }
    if (mutated) root.scores = scores;
  }
  root.findings = coerceFindingLikeArray(root.findings);
  root.hardFails = coerceHardFailLikeArray(root.hardFails);
  return root;
}
function parseModelJsonObject(raw, schema, normalize) {
  const jsonStr = extractLlmJsonObjectSegment(raw, {
    requireObject: true,
    emptyMessage: "Evaluator model returned no JSON object"
  });
  let parsed = parseJsonLenient(jsonStr);
  if (normalize) parsed = normalize(parsed);
  return schema.parse(parsed);
}
const EVAL_DEGRADED_LOG_MAX = 400;
function buildDegradedReport(rubric, error) {
  const message = normalizeError(error);
  const logBody = message.length > EVAL_DEGRADED_LOG_MAX ? `${message.slice(0, EVAL_DEGRADED_LOG_MAX)}…` : message;
  console.warn("[eval:worker-degraded]", { rubric, message: logBody });
  return {
    rubric,
    scores: {
      evaluator_unavailable: { score: 0, notes: `Worker failed: ${message}` }
    },
    findings: [
      {
        severity: "high",
        summary: "Evaluator worker failed",
        detail: message
      }
    ],
    hardFails: [
      {
        code: "evaluator_worker_error",
        message: message.slice(0, EVAL_DEGRADED_MSG_MAX)
      }
    ]
  };
}
async function runOneEvaluator(rubric, systemPrompt, userContent, providerId, modelId, logCtx) {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  const evaluatorThinking = resolveThinkingConfig("evaluator", modelId);
  const response = await loggedGenerateChat(
    provider,
    providerId,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ],
    { model: modelId, signal: logCtx.signal, thinking: evaluatorThinking },
    {
      source: "evaluator",
      phase: `Rubric: ${rubric}`,
      ...logCtx.correlationId ? { correlationId: `${logCtx.correlationId}:eval:${rubric}` } : {}
    }
  );
  const parsed = parseModelJsonObject(response.raw, evaluatorWorkerReportSchema, normalizeEvaluatorWorkerPayload);
  return { ...parsed, rawTrace: response.raw };
}
async function runEvaluatorWorker(rubric, systemPrompt, userContent, providerId, modelId, logCtx) {
  try {
    const report = await runOneEvaluator(
      rubric,
      systemPrompt,
      userContent,
      providerId,
      modelId,
      logCtx
    );
    if (report.rubric !== rubric) {
      return buildDegradedReport(
        rubric,
        new Error(`Rubric mismatch: expected ${rubric}, got ${report.rubric}`)
      );
    }
    return report;
  } catch (err) {
    return buildDegradedReport(rubric, err);
  }
}
async function runEvaluationWorkers(input) {
  const evalProviderId = input.evaluatorProviderId ?? input.providerId;
  const evalModelId = input.evaluatorModelId ?? input.modelId;
  const previewSessionId = createPreviewSession(input.files);
  const previewPageUrl = `${env.previewPublicBaseUrl}/api/preview/sessions/${previewSessionId}/${encodeVirtualPathForUrl(resolvePreviewEntryPath(input.files))}`;
  try {
    const userContent = buildEvaluatorUserContent(
      input.files,
      input.compiledPrompt,
      input.context,
      previewPageUrl
    );
    const [sysDesign, sysStrategy, sysImpl] = await Promise.all([
      getPromptBody("evaluator-design-quality"),
      getPromptBody("evaluator-strategy-fidelity"),
      getPromptBody("evaluator-implementation")
    ]);
    const evalLogCtx = {
      correlationId: input.correlationId,
      signal: input.signal
    };
    const runDesign = () => runEvaluatorWorker("design", sysDesign, userContent, evalProviderId, evalModelId, evalLogCtx);
    const runStrategy = () => runEvaluatorWorker("strategy", sysStrategy, userContent, evalProviderId, evalModelId, evalLogCtx);
    const runImpl = () => runEvaluatorWorker(
      "implementation",
      sysImpl,
      userContent,
      evalProviderId,
      evalModelId,
      evalLogCtx
    );
    const runBrowser = async () => {
      try {
        const preflight = runBrowserQA({ files: input.files });
        if (!env.BROWSER_PLAYWRIGHT_EVAL) {
          return preflight;
        }
        const pw = await runBrowserPlaywrightEval({ files: input.files, previewPageUrl });
        return mergePreflightWithPlaywright(preflight, pw);
      } catch (err) {
        return buildDegradedReport("browser", err);
      }
    };
    const rubricJobs = [
      { rubric: "design", run: runDesign },
      { rubric: "strategy", run: runStrategy },
      { rubric: "implementation", run: runImpl },
      { rubric: "browser", run: runBrowser }
    ];
    const emitDone = (rubric, report) => {
      input.onWorkerDone?.(rubric, report);
      return report;
    };
    const runWorker = (job) => job.run().then(
      (report) => emitDone(job.rubric, report),
      (reason) => emitDone(job.rubric, buildDegradedReport(job.rubric, reason))
    );
    if (input.parallel) {
      const [design2, strategy2, implementation2, browser2] = await Promise.all(rubricJobs.map(runWorker));
      return { design: design2, strategy: strategy2, implementation: implementation2, browser: browser2 };
    }
    const [design, strategy, implementation, browser] = [
      await runWorker(rubricJobs[0]),
      await runWorker(rubricJobs[1]),
      await runWorker(rubricJobs[2]),
      await runWorker(rubricJobs[3])
    ];
    return { design, strategy, implementation, browser };
  } finally {
    deletePreviewSession(previewSessionId);
  }
}
const revisionGate = { "criticalScoreMax": 2, "implCriticalScoreMax": 1, "lowAverageThreshold": 3.5 };
const maxRevisionRoundsCap = 20;
const rawThresholds = {
  revisionGate,
  maxRevisionRoundsCap
};
const EvaluationThresholdsFileSchema = z.object({
  revisionGate: z.object({
    criticalScoreMax: z.number().int().min(0),
    implCriticalScoreMax: z.number().int().min(0),
    lowAverageThreshold: z.number().min(0)
  }).strict(),
  maxRevisionRoundsCap: z.number().int().min(1)
}).strict();
const _thresholds = EvaluationThresholdsFileSchema.parse(rawThresholds);
const DESIGN_STRATEGY_RUBRICS = /* @__PURE__ */ new Set(["design", "strategy"]);
const IMPL_BROWSER_RUBRICS = /* @__PURE__ */ new Set(["implementation", "browser"]);
const RUBRIC_WEIGHTS = { ...DEFAULT_RUBRIC_WEIGHTS };
function resolveRubricWeights(override) {
  if (!override || Object.keys(override).length === 0) {
    return { ...RUBRIC_WEIGHTS };
  }
  const out = { ...RUBRIC_WEIGHTS };
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const v = override[rid];
    if (v != null && Number.isFinite(v) && v >= 0) {
      out[rid] = v;
    }
  }
  const sum = EVALUATOR_RUBRIC_IDS.reduce((acc, rid) => acc + out[rid], 0);
  if (sum <= 0) return { ...RUBRIC_WEIGHTS };
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    out[rid] = out[rid] / sum;
  }
  return out;
}
const REVISION_GATE_CRITICAL_SCORE_MAX = _thresholds.revisionGate.criticalScoreMax;
const REVISION_GATE_IMPL_CRITICAL_SCORE_MAX = _thresholds.revisionGate.implCriticalScoreMax;
const REVISION_GATE_LOW_AVERAGE_THRESHOLD = _thresholds.revisionGate.lowAverageThreshold;
const MAX_REVISION_ROUNDS_CAP = _thresholds.maxRevisionRoundsCap;
function rubricFromNormalizedScoreKey(key) {
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const prefix = `${rid}_`;
    if (key.startsWith(prefix)) return rid;
  }
  return null;
}
function tieredAnyCriticalNormalizedScores(normalizedScores) {
  for (const [key, score] of Object.entries(normalizedScores)) {
    const r = rubricFromNormalizedScoreKey(key);
    if (!r) continue;
    if (DESIGN_STRATEGY_RUBRICS.has(r) && score <= REVISION_GATE_CRITICAL_SCORE_MAX) return true;
    if (IMPL_BROWSER_RUBRICS.has(r) && score <= REVISION_GATE_IMPL_CRITICAL_SCORE_MAX) return true;
  }
  return false;
}
function meanRubricScores(scores) {
  const vals = Object.values(scores).map((s) => s.score);
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}
function computeWeightedOverallFromRubricMeans(means, weights = RUBRIC_WEIGHTS) {
  let sum = 0;
  let w = 0;
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const m = means[rid];
    if (m === void 0 || !Number.isFinite(m)) continue;
    const wt = weights[rid];
    if (!Number.isFinite(wt) || wt <= 0) continue;
    sum += wt * m;
    w += wt;
  }
  if (w <= 0) return 0;
  return sum / w;
}
function rubricMeansFromNormalizedScores(normalizedScores) {
  const out = {};
  for (const rid of EVALUATOR_RUBRIC_IDS) {
    const prefix = `${rid}_`;
    const vals = Object.entries(normalizedScores).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
    if (vals.length > 0) {
      out[rid] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
  return out;
}
const SEVERITY_RANK = {
  high: 0,
  medium: 1,
  low: 2
};
const FINDING_SOURCE_PRIORITY = {
  design: 0,
  strategy: 1,
  implementation: 2,
  browser: 3
};
function aggregateEvaluationReports(reports, rubricWeightOverride) {
  const normalizedScores = {};
  const rubricMeans = {};
  for (const rubric of EVALUATOR_RUBRIC_IDS) {
    rubricMeans[rubric] = meanRubricScores(reports[rubric].scores);
    for (const [criterion, { score }] of Object.entries(reports[rubric].scores)) {
      const key = `${rubric}_${criterion}`;
      normalizedScores[key] = score;
    }
  }
  const weights = resolveRubricWeights(rubricWeightOverride);
  const overallScore = computeWeightedOverallFromRubricMeans(rubricMeans, weights);
  const evaluatorTraces = {};
  for (const rubric of ["design", "strategy", "implementation"]) {
    const t = reports[rubric].rawTrace;
    if (t != null && t.length > 0) evaluatorTraces[rubric] = t;
  }
  const hardFails = [];
  for (const rubric of EVALUATOR_RUBRIC_IDS) {
    for (const hf of reports[rubric].hardFails) {
      hardFails.push({ ...hf, source: rubric });
    }
  }
  const allFindings = [];
  for (const rubric of EVALUATOR_RUBRIC_IDS) {
    for (const f of reports[rubric].findings) {
      allFindings.push({ ...f, source: rubric });
    }
  }
  allFindings.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return FINDING_SOURCE_PRIORITY[a.source] - FINDING_SOURCE_PRIORITY[b.source];
  });
  const seenSummaries = /* @__PURE__ */ new Set();
  const findingFixes = [];
  for (const f of allFindings) {
    if (seenSummaries.has(f.summary)) continue;
    seenSummaries.add(f.summary);
    findingFixes.push(`[${f.severity}] ${f.summary}: ${f.detail}`);
  }
  const hardFailFixes = hardFails.map((hf) => `[hard_fail:${hf.code}] ${hf.message}`);
  const prioritizedFixes = [...hardFailFixes, ...findingFixes];
  let revisionBrief = "## Prioritized remediation\n\n";
  if (prioritizedFixes.length === 0) {
    revisionBrief += "- No specific findings; review normalized scores for weak dimensions.\n";
  } else {
    for (const fix of prioritizedFixes) {
      revisionBrief += `- ${fix}
`;
    }
  }
  return {
    overallScore,
    normalizedScores,
    hardFails,
    prioritizedFixes,
    /**
     * Always `false` here — revision is driven only by {@link enforceRevisionGate} rules
     * (hard fails, tiered critical scores, low weighted average), not by LLM `shouldRevise`.
     * @see isEvalSatisfied — with no `minOverallScore`, stopping uses `!aggregate.shouldRevise` after the gate.
     */
    shouldRevise: false,
    revisionBrief,
    evaluatorTraces: Object.keys(evaluatorTraces).length > 0 ? evaluatorTraces : void 0
  };
}
function isEvalSatisfied(aggregate, opts) {
  if (aggregate.hardFails.length > 0) return false;
  const threshold = opts?.minOverallScore;
  if (threshold != null && Number.isFinite(threshold)) {
    return Number.isFinite(aggregate.overallScore) && aggregate.overallScore >= threshold;
  }
  return !aggregate.shouldRevise;
}
function enforceRevisionGate(report) {
  const anyCritical = tieredAnyCriticalNormalizedScores(report.normalizedScores);
  const hasHardFails = report.hardFails.length > 0;
  const weighted = Number.isFinite(report.overallScore) ? report.overallScore : 0;
  const lowAverage = weighted < REVISION_GATE_LOW_AVERAGE_THRESHOLD;
  const shouldRevise = report.shouldRevise || hasHardFails || anyCritical || lowAverage;
  return {
    ...report,
    shouldRevise,
    overallScore: weighted > 0 ? weighted : 0
  };
}
const LOG_PROMPT_KEYS = [
  "designer-agentic-system",
  "evaluator-design-quality",
  "evaluator-strategy-fidelity",
  "evaluator-implementation",
  "designer-agentic-revision-user"
];
function stripRawTrace(r) {
  const { rawTrace: _strip, ...rest } = r;
  return rest;
}
function stripAggregateForDisk(agg) {
  const { evaluatorTraces: _strip, ...rest } = agg;
  return rest;
}
async function writeAgenticEvalRunLog(input) {
  const root = path.join(input.baseDir, "eval-runs", input.runId);
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, "prompts"), { recursive: true });
  const meta = {
    runId: input.runId,
    stopReason: input.stopReason,
    finalOverallScore: input.finalAggregate.overallScore,
    strategyName: input.evaluationContext?.strategyName,
    hypothesisSnippet: input.evaluationContext?.hypothesis?.slice(0, 500),
    evaluationRoundCount: input.rounds.length
  };
  await writeFile(path.join(root, "meta.json"), `${JSON.stringify(meta, null, 2)}
`, "utf8");
  for (const key of LOG_PROMPT_KEYS) {
    const body = await getPromptBody(key);
    await writeFile(path.join(root, "prompts", `${key}.txt`), body, "utf8");
  }
  const ctx = await buildAgenticSystemContext({});
  for (const entry of ctx.skillCatalog) {
    const relPath = `skills/${entry.key}/SKILL.md`;
    const dest = path.join(root, relPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, entry.bodyMarkdown, "utf8");
  }
  for (const snap of input.rounds) {
    const rd = path.join(root, `round-${snap.round}`);
    const filesRoot = path.join(rd, "files");
    await mkdir(filesRoot, { recursive: true });
    const files = snap.files ?? {};
    for (const [p, c] of Object.entries(files)) {
      const safe = p.replace(/^\/+/, "").split("/").filter((seg) => seg !== ".." && seg !== "");
      if (safe.length === 0) continue;
      const fp = path.join(filesRoot, ...safe);
      await mkdir(path.dirname(fp), { recursive: true });
      await writeFile(fp, c, "utf8");
    }
    const dump = async (name) => {
      const w = snap[name];
      if (!w) return;
      if (w.rawTrace != null && w.rawTrace.length > 0) {
        await writeFile(path.join(rd, `${name}.raw.txt`), w.rawTrace, "utf8");
      }
      await writeFile(
        path.join(rd, `${name}.json`),
        `${JSON.stringify(stripRawTrace(w), null, 2)}
`,
        "utf8"
      );
    };
    await dump("design");
    await dump("strategy");
    await dump("implementation");
    await dump("browser");
    await writeFile(
      path.join(rd, "aggregate.json"),
      `${JSON.stringify(stripAggregateForDisk(snap.aggregate), null, 2)}
`,
      "utf8"
    );
    const rev = input.revisionPromptByEvalRound.get(snap.round);
    if (rev) {
      await writeFile(path.join(rd, "revision-prompt.txt"), rev, "utf8");
    }
  }
  await writeFile(path.join(root, "compiled-prompt.txt"), input.compiledPrompt, "utf8");
}
const CHECKPOINT_TODO_SUMMARY_MAX = 5;
async function emitOrchestratorEvent(ctx, e) {
  try {
    await ctx.onStream(e);
  } catch (err) {
    if (env.isDev) {
      console.error("[agentic-orchestrator] onStream failed", normalizeError(err), err);
    }
    ctx.onDeliveryFailure?.();
  }
}
function stripEvaluationSnapshotForStream(s) {
  const stripWorker = (w) => {
    if (!w) return w;
    const { rawTrace: _rt, ...rest } = w;
    return rest;
  };
  const { evaluatorTraces: _et, ...aggRest } = s.aggregate;
  return {
    ...s,
    design: stripWorker(s.design),
    strategy: stripWorker(s.strategy),
    implementation: stripWorker(s.implementation),
    browser: stripWorker(s.browser),
    aggregate: aggRest
  };
}
async function runEvaluationRound(options, streamCtx, round, files, parallel) {
  await emitOrchestratorEvent(streamCtx, {
    type: "evaluation_progress",
    round,
    phase: "parallel_start",
    message: parallel ? "Running design, strategy, and implementation evaluators in parallel…" : "Running evaluators sequentially…"
  });
  const workers = await runEvaluationWorkers({
    files,
    compiledPrompt: options.compiledPrompt,
    context: options.evaluationContext ?? void 0,
    providerId: options.build.providerId,
    modelId: options.build.modelId,
    evaluatorProviderId: options.evaluatorProviderId,
    evaluatorModelId: options.evaluatorModelId,
    parallel,
    correlationId: options.build.correlationId,
    signal: options.build.signal,
    onWorkerDone: async (rubric, report) => {
      await emitOrchestratorEvent(streamCtx, { type: "evaluation_worker_done", round, rubric, report });
    }
  });
  const rawAgg = aggregateEvaluationReports(workers, options.rubricWeights);
  const aggregate = enforceRevisionGate(rawAgg);
  const snapshot = {
    round,
    files: { ...files },
    design: workers.design,
    strategy: workers.strategy,
    implementation: workers.implementation,
    browser: workers.browser,
    aggregate
  };
  await emitOrchestratorEvent(streamCtx, {
    type: "evaluation_report",
    round,
    snapshot: stripEvaluationSnapshotForStream(snapshot)
  });
  return snapshot;
}
function appendEvaluationRoundHistory(snapshot, history) {
  history.push({
    round: snapshot.round,
    rubricMeans: rubricMeansFromNormalizedScores(snapshot.aggregate.normalizedScores),
    overallScore: snapshot.aggregate.overallScore,
    hardFailCount: snapshot.aggregate.hardFails.length,
    normalizedScores: { ...snapshot.aggregate.normalizedScores }
  });
}
function buildCheckpoint(files, rounds, opts) {
  const finalRound = rounds[rounds.length - 1];
  const completedTodos = finalRound ? [...finalRound.design?.findings.map((f) => f.summary) ?? []].slice(0, CHECKPOINT_TODO_SUMMARY_MAX) : [];
  return {
    totalRounds: rounds.length,
    filesWritten: Object.keys(files),
    finalTodosSummary: completedTodos.join("; ") || "No findings recorded",
    revisionBriefApplied: opts.revisionBriefApplied,
    completedAt: (/* @__PURE__ */ new Date()).toISOString(),
    stopReason: opts.stopReason,
    revisionAttempts: opts.revisionAttempts
  };
}
function agenticResult(files, rounds, snapshot, checkpointOpts, emittedFilePaths) {
  return {
    files,
    rounds,
    finalAggregate: snapshot.aggregate,
    checkpoint: buildCheckpoint(files, rounds, checkpointOpts),
    emittedFilePaths
  };
}
function buildSkippedEvalAggregate() {
  const normalizedScores = Object.fromEntries(
    EVALUATOR_RUBRIC_IDS.map((id) => [id, 0])
  );
  return {
    overallScore: 0,
    normalizedScores,
    hardFails: [],
    prioritizedFixes: [],
    shouldRevise: false,
    revisionBrief: ""
  };
}
function agenticBuildOnlyResult(files, emittedFilePaths, stopReason = "build_only") {
  const aggregate = buildSkippedEvalAggregate();
  return {
    files,
    rounds: [],
    finalAggregate: aggregate,
    checkpoint: buildCheckpoint(files, [], {
      stopReason,
      revisionAttempts: 0
    }),
    emittedFilePaths
  };
}
async function runAgenticPiSessionRound(options, streamCtx, forward, tracePhase, setPiTracePhase, sessionExtras) {
  const ctx = await buildAgenticSystemContext({ sessionType: options.sessionType });
  await emitSkillsLoadedEvents((e) => emitOrchestratorEvent(streamCtx, e), ctx.loadedSkills, tracePhase);
  setPiTracePhase(tracePhase);
  const extras = typeof sessionExtras === "function" ? sessionExtras(ctx) : sessionExtras;
  return runDesignAgentSession(
    {
      ...options.build,
      ...extras,
      sessionType: options.sessionType ?? "design",
      systemPrompt: ctx.systemPrompt,
      skillCatalog: ctx.skillCatalog
    },
    forward
  );
}
function buildRevisionUserContext(compiledPrompt, evaluationContext) {
  const truncated = compiledPrompt.length > REVISION_COMPILED_PROMPT_MAX ? `${compiledPrompt.slice(0, REVISION_COMPILED_PROMPT_MAX)}
…[truncated]` : compiledPrompt;
  const parts = ["## Original design request (preserve intent)", "", truncated, ""];
  const ctx = evaluationContext;
  if (ctx?.strategyName) parts.push(`**Strategy:** ${ctx.strategyName}`);
  if (ctx?.hypothesis) parts.push(`**Hypothesis:** ${ctx.hypothesis}`);
  if (ctx?.rationale) parts.push(`**Rationale:** ${ctx.rationale}`);
  if (ctx?.measurements) parts.push(`**KPIs / measurements:** ${ctx.measurements}`);
  if (ctx?.objectivesMetrics) parts.push(`**Objectives & metrics:** ${ctx.objectivesMetrics}`);
  if (ctx?.designConstraints) parts.push(`**Design constraints:** ${ctx.designConstraints}`);
  if (parts.length > 4) parts.push("");
  return parts.join("\n");
}
function truncTrace(s, max) {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}
…[truncated]`;
}
const DEFAULT_TRACE_BUDGET = { design: 3e3, strategy: 3e3, implementation: 1500 };
function buildEvaluatorTracesSection(traces, budget = {}) {
  if (!traces || Object.keys(traces).length === 0) return "";
  const d = budget.design ?? DEFAULT_TRACE_BUDGET.design;
  const st = budget.strategy ?? DEFAULT_TRACE_BUDGET.strategy;
  const impl = budget.implementation ?? DEFAULT_TRACE_BUDGET.implementation;
  const parts = ["## Evaluator reasoning (raw model output)", ""];
  const order = ["design", "strategy", "implementation"];
  for (const rubric of order) {
    const raw = traces[rubric];
    if (raw == null || raw.length === 0) continue;
    const label = rubric === "design" ? "Design quality evaluator" : rubric === "strategy" ? "Strategy fidelity evaluator" : "Implementation evaluator";
    const b = rubric === "design" ? d : rubric === "strategy" ? st : impl;
    parts.push(`### ${label}`, "", truncTrace(raw, b), "");
  }
  return parts.join("\n").trimEnd();
}
function fmtMean(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}
function criterionDeltas(prev, curr) {
  const keys = /* @__PURE__ */ new Set([...Object.keys(prev), ...Object.keys(curr)]);
  const out = [];
  for (const k of keys) {
    const a = prev[k];
    const b = curr[k];
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    const delta = b - a;
    if (delta !== 0) out.push({ key: k, delta });
  }
  return out;
}
function buildRoundHistorySection(history) {
  if (history.length === 0) return "";
  const lines = ["## Revision history", "", "| Round | Design | Strategy | Impl | Browser | Overall | Hard fails |", "|---|---|---|---|---|---|---|"];
  for (const h of history) {
    lines.push(
      `| ${h.round} | ${fmtMean(h.rubricMeans.design)} | ${fmtMean(h.rubricMeans.strategy)} | ${fmtMean(h.rubricMeans.implementation)} | ${fmtMean(h.rubricMeans.browser)} | ${fmtMean(h.overallScore)} | ${h.hardFailCount} |`
    );
  }
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const curr = history[history.length - 1];
    const deltas = criterionDeltas(prev.normalizedScores, curr.normalizedScores);
    const improved = [...deltas].filter((x) => x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);
    const regressed = [...deltas].filter((x) => x.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
    lines.push("");
    lines.push(
      `Rounds ${prev.round}→${curr.round}: rubric means Δ design ${formatDeltaNumber(curr.rubricMeans.design, prev.rubricMeans.design)}, strategy ${formatDeltaNumber(curr.rubricMeans.strategy, prev.rubricMeans.strategy)}, implementation ${formatDeltaNumber(curr.rubricMeans.implementation, prev.rubricMeans.implementation)}, browser ${formatDeltaNumber(curr.rubricMeans.browser, prev.rubricMeans.browser)}.`
    );
    if (improved.length) {
      lines.push(
        `Largest improvements: ${improved.map((x) => `${x.key} +${x.delta.toFixed(2)}`).join("; ")}.`
      );
    }
    if (regressed.length) {
      lines.push(
        `Largest regressions: ${regressed.map((x) => `${x.key} ${x.delta.toFixed(2)}`).join("; ")}.`
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}
function formatDeltaNumber(cur, prev) {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) return "n/a";
  const d = cur - prev;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(2)}`;
}
function buildRevisionUserPrompt(args) {
  const { compiledPrompt, evaluationContext, revisionUserInstructions, roundHistory, snapshot } = args;
  const tracesSection = buildEvaluatorTracesSection(snapshot.aggregate.evaluatorTraces);
  const parts = [
    buildRevisionUserContext(compiledPrompt, evaluationContext ?? void 0),
    revisionUserInstructions,
    "",
    buildRoundHistorySection(roundHistory),
    "## Revision brief",
    snapshot.aggregate.revisionBrief
  ];
  if (tracesSection.length > 0) {
    parts.push("", tracesSection);
  }
  parts.push(
    "",
    "## Prioritized fixes",
    ...snapshot.aggregate.prioritizedFixes.map((f, i) => `${i + 1}. ${f}`)
  );
  return parts.join("\n");
}
function decideStopReason(args) {
  if (args.aborted) return "aborted";
  if (args.satisfied) return "satisfied";
  return "max_revisions";
}
async function runAgenticWithEvaluation(options) {
  return runAgenticWithEvaluationImpl(options);
}
async function runAgenticWithEvaluationImpl(options) {
  const provider = getProvider(options.build.providerId);
  const parallel = provider?.supportsParallel ?? false;
  const streamFailureCtrl = options.streamFailureController ?? new AbortController();
  const upstreamSignal = options.build.signal;
  const effectiveSignal = upstreamSignal != null ? AbortSignal.any([upstreamSignal, streamFailureCtrl.signal]) : streamFailureCtrl.signal;
  const mergedOptions = {
    ...options,
    build: { ...options.build, signal: effectiveSignal }
  };
  const streamCtx = {
    onStream: options.onStream,
    onDeliveryFailure: () => streamFailureCtrl.abort()
  };
  const maxRevisions = Math.max(0, Math.min(MAX_REVISION_ROUNDS_CAP, options.maxRevisionRounds));
  const satisfactionOpts = options.minOverallScore != null && Number.isFinite(options.minOverallScore) ? { minOverallScore: options.minOverallScore } : void 0;
  const acquired = await acquireAgenticSlotOrReject();
  if (!acquired) {
    await emitOrchestratorEvent(streamCtx, {
      type: "error",
      payload: "Too many agentic design runs are active on this server. Please wait a moment and try again."
    });
    return null;
  }
  try {
    const revisionPromptByEvalRound = /* @__PURE__ */ new Map();
    const finishWithLog = (result) => {
      const baseDir = env.OBSERVABILITY_LOG_BASE_DIR;
      if (baseDir) {
        void writeAgenticEvalRunLog({
          baseDir,
          runId: mergedOptions.build.correlationId ?? randomUUID(),
          compiledPrompt: mergedOptions.compiledPrompt,
          evaluationContext: mergedOptions.evaluationContext ?? void 0,
          rounds: result.rounds,
          revisionPromptByEvalRound,
          stopReason: result.checkpoint.stopReason ?? "unknown",
          finalAggregate: result.finalAggregate
        }).catch((err) => {
          if (env.isDev) console.warn("[eval-run-log]", normalizeError(err), err);
        });
      }
      return result;
    };
    const tracePhaseRef = { current: "building" };
    const forward = async (e) => {
      if (e.type === "skill_activated") {
        await emitOrchestratorEvent(streamCtx, {
          type: "trace",
          trace: makeRunTraceEvent({
            kind: "skill_activated",
            label: `Skill activated: ${e.name} (${e.key})`,
            phase: tracePhaseRef.current,
            status: "success"
          })
        });
      }
      await emitOrchestratorEvent(streamCtx, e);
    };
    await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "building" });
    const setPiTrace = (p) => {
      tracePhaseRef.current = p;
    };
    const buildResult = await runAgenticPiSessionRound(
      mergedOptions,
      streamCtx,
      forward,
      "building",
      setPiTrace,
      () => {
        const extra = mergedOptions.build.seedFiles ?? {};
        const seedFilesForBuild = Object.keys(extra).length > 0 ? extra : void 0;
        return { seedFiles: seedFilesForBuild };
      }
    );
    if (!buildResult) return null;
    if (effectiveSignal.aborted) {
      if (env.isDev) {
        console.debug("[agentic-orchestrator] build phase: effectiveSignal aborted after Pi session", {
          correlationId: mergedOptions.build.correlationId,
          upstreamAbort: upstreamSignal?.aborted ?? false,
          deliveryAbort: streamFailureCtrl.signal.aborted
        });
      }
      return finishWithLog(
        agenticBuildOnlyResult(
          buildResult.files,
          [...buildResult.emittedFilePaths ?? []],
          "aborted"
        )
      );
    }
    let files = buildResult.files;
    const emittedDuringRun = new Set(buildResult.emittedFilePaths ?? []);
    const rounds = [];
    const roundHistory = [];
    let revisionAttempts = 0;
    let lastRevisionBrief;
    const returnWithCheckpoint = (snapshotArg, stopReason2) => finishWithLog(
      agenticResult(
        files,
        rounds,
        snapshotArg,
        {
          stopReason: stopReason2,
          revisionAttempts,
          revisionBriefApplied: lastRevisionBrief
        },
        [...emittedDuringRun]
      )
    );
    if (mergedOptions.evaluationContext === null) {
      await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "complete" });
      return finishWithLog(agenticBuildOnlyResult(files, [...emittedDuringRun]));
    }
    await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "evaluating" });
    let evalRound = 1;
    let snapshot = await runEvaluationRound(mergedOptions, streamCtx, evalRound, files, parallel);
    rounds.push(snapshot);
    appendEvaluationRoundHistory(snapshot, roundHistory);
    if (effectiveSignal.aborted) {
      return returnWithCheckpoint(snapshot, "aborted");
    }
    const revisionUserInstructions = (await getPromptBody("designer-agentic-revision-user")).trim();
    while (!isEvalSatisfied(snapshot.aggregate, satisfactionOpts) && revisionAttempts < maxRevisions && !effectiveSignal.aborted) {
      await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "revising" });
      const brief = snapshot.aggregate.revisionBrief;
      lastRevisionBrief = brief;
      await emitOrchestratorEvent(streamCtx, {
        type: "revision_round",
        round: revisionAttempts + 1,
        brief
      });
      const revisionUser = buildRevisionUserPrompt({
        compiledPrompt: options.compiledPrompt,
        evaluationContext: options.evaluationContext,
        revisionUserInstructions,
        roundHistory,
        snapshot
      });
      revisionPromptByEvalRound.set(snapshot.round, revisionUser);
      debugAgentIngest({
        hypothesisId: "H7",
        location: "agentic-orchestrator.ts:revision_start",
        message: "runDesignAgentSession (revision) starting",
        data: {
          revisionAttempt: revisionAttempts + 1,
          revisionUserChars: revisionUser.length,
          prioritizedFixesCount: snapshot.aggregate.prioritizedFixes.length,
          designFileCount: Object.keys(files).length
        }
      });
      const revised = await runAgenticPiSessionRound(mergedOptions, streamCtx, forward, "revising", setPiTrace, () => ({
        userPrompt: revisionUser,
        seedFiles: files,
        compactionNote: `Post-evaluation revision requested. Overall ${snapshot.aggregate.overallScore.toFixed(2)}. Hard fails: ${snapshot.aggregate.hardFails.length}.`,
        initialProgressMessage: "Revising design from evaluation feedback…"
      }));
      if (!revised || effectiveSignal.aborted) {
        const stopReason2 = effectiveSignal.aborted ? "aborted" : "revision_failed";
        debugAgentIngest({
          hypothesisId: "H7",
          location: "agentic-orchestrator.ts:revision_end",
          message: "runDesignAgentSession (revision) aborted or null",
          data: { revisionAttempt: revisionAttempts + 1, aborted: !!effectiveSignal.aborted }
        });
        return returnWithCheckpoint(snapshot, stopReason2);
      }
      debugAgentIngest({
        hypothesisId: "H7",
        location: "agentic-orchestrator.ts:revision_end",
        message: "runDesignAgentSession (revision) finished",
        data: {
          revisionAttempt: revisionAttempts + 1,
          outFileCount: Object.keys(revised.files).length
        }
      });
      files = revised.files;
      for (const p of revised.emittedFilePaths ?? []) {
        emittedDuringRun.add(p);
      }
      revisionAttempts += 1;
      evalRound += 1;
      await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "evaluating" });
      snapshot = await runEvaluationRound(mergedOptions, streamCtx, evalRound, files, parallel);
      rounds.push(snapshot);
      appendEvaluationRoundHistory(snapshot, roundHistory);
      if (effectiveSignal.aborted) {
        return returnWithCheckpoint(snapshot, "aborted");
      }
    }
    const stopReason = decideStopReason({
      aborted: effectiveSignal.aborted,
      satisfied: isEvalSatisfied(snapshot.aggregate, satisfactionOpts)
    });
    await emitOrchestratorEvent(streamCtx, { type: "phase", phase: "complete" });
    return returnWithCheckpoint(snapshot, stopReason);
  } finally {
    releaseAgenticSlot();
  }
}
async function executeGenerateStream(stream, body, abortSignal, options) {
  const { allocId, laneIndex, laneEndMode = "done", writeGate, correlationId } = options;
  const gate = writeGate ?? { enqueue: (fn) => fn() };
  const wrap = (data) => laneIndex !== void 0 ? { ...data, laneIndex } : data;
  const sseWriteAudit = env.isDev ? { byType: {}, skippedAbort: 0, t0: Date.now() } : null;
  const streamFailureCtrl = new AbortController();
  const sseWriteAbort = AbortSignal.any([abortSignal, streamFailureCtrl.signal]);
  const write = async (event, data) => {
    if (sseWriteAudit) sseWriteAudit.byType[event] = (sseWriteAudit.byType[event] ?? 0) + 1;
    const payload = JSON.stringify(wrap(data));
    await gate.enqueue(async () => {
      await stream.writeSSE({ data: payload, event, id: allocId() });
    });
  };
  const writeAgentic = async (event) => {
    if (sseWriteAbort.aborted) {
      if (sseWriteAudit) sseWriteAudit.skippedAbort += 1;
      return;
    }
    const { sseEvent, data } = agenticOrchestratorEventToSse(event);
    await write(sseEvent, data);
  };
  const runAgentic = async () => {
    const thinkingOverride = body.thinking ?? (body.thinkingLevel ? { level: body.thinkingLevel } : void 0);
    const designThinking = resolveThinkingConfig("design", body.modelId, thinkingOverride);
    const agenticResult2 = await runAgenticWithEvaluation({
      build: {
        userPrompt: body.prompt,
        providerId: body.providerId,
        modelId: body.modelId,
        thinkingLevel: designThinking.level,
        signal: abortSignal,
        ...correlationId ? { correlationId } : {}
      },
      streamFailureController: streamFailureCtrl,
      compiledPrompt: body.prompt,
      evaluationContext: body.evaluationContext,
      evaluatorProviderId: body.evaluatorProviderId,
      evaluatorModelId: body.evaluatorModelId,
      maxRevisionRounds: body.agenticMaxRevisionRounds ?? env.AGENTIC_MAX_REVISION_ROUNDS,
      minOverallScore: body.agenticMinOverallScore ?? env.AGENTIC_MIN_OVERALL_SCORE,
      rubricWeights: body.rubricWeights,
      onStream: writeAgentic
    });
    if (agenticResult2) {
      const alreadyEmitted = new Set(agenticResult2.emittedFilePaths ?? []);
      let replayed = 0;
      for (const [path2, content] of Object.entries(agenticResult2.files)) {
        if (!alreadyEmitted.has(path2)) {
          await writeAgentic({ type: "file", path: path2, content });
          replayed += 1;
        }
      }
      if (env.isDev && replayed > 0) {
        console.debug("[generate:SSE] replayed file events for paths not streamed live", {
          replayed,
          paths: Object.keys(agenticResult2.files).filter((p) => !alreadyEmitted.has(p))
        });
      }
    }
    if (agenticResult2?.checkpoint) {
      await write(SSE_EVENT_NAMES.checkpoint, { checkpoint: agenticResult2.checkpoint });
    }
    if (laneEndMode === "lane_done" && laneIndex !== void 0) {
      await write(SSE_EVENT_NAMES.lane_done, { laneIndex });
    } else {
      await write(SSE_EVENT_NAMES.done, {});
    }
    if (sseWriteAudit) {
      console.debug("[generate:SSE] agentic write summary", {
        byType: sseWriteAudit.byType,
        skippedAbort: sseWriteAudit.skippedAbort,
        durationMs: Date.now() - sseWriteAudit.t0,
        checkpoint: agenticResult2?.checkpoint ? {
          stopReason: agenticResult2.checkpoint.stopReason,
          filesWritten: agenticResult2.checkpoint.filesWritten,
          revisionAttempts: agenticResult2.checkpoint.revisionAttempts
        } : null
      });
    }
  };
  await runAgentic();
}
async function tryWriteSseErrorTail(stream, gate, options, primaryErr) {
  const payload = JSON.stringify(
    options.laneIndex !== void 0 ? { error: normalizeProviderError(primaryErr), laneIndex: options.laneIndex } : { error: normalizeProviderError(primaryErr) }
  );
  try {
    await gate.enqueue(async () => {
      await stream.writeSSE({
        data: payload,
        event: SSE_EVENT_NAMES.error,
        id: options.allocId()
      });
    });
  } catch (writeErr) {
    if (env.isDev) {
      console.error("[generate:SSE] failed to write error event (client likely disconnected)", writeErr);
    }
  }
  if (options.laneEndMode === "lane_done" && options.laneIndex !== void 0) {
    try {
      await gate.enqueue(async () => {
        await stream.writeSSE({
          data: JSON.stringify({ laneIndex: options.laneIndex }),
          event: SSE_EVENT_NAMES.lane_done,
          id: options.allocId()
        });
      });
    } catch (writeErr) {
      if (env.isDev) {
        console.error("[generate:SSE] failed to write lane_done after error", writeErr);
      }
    }
  }
}
async function executeGenerateStreamSafe(stream, body, abortSignal, options) {
  try {
    await executeGenerateStream(stream, body, abortSignal, options);
  } catch (err) {
    const gate = options.writeGate ?? { enqueue: (fn) => fn() };
    await tryWriteSseErrorTail(stream, gate, options, err);
  }
}
export {
  GenerateStreamBodySchema as G,
  executeGenerateStreamSafe as e
};
