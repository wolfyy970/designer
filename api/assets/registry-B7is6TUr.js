import { e as env } from "../[[...route]].js";
import { z } from "zod";
import { n as normalizeOpenRouterCreditError } from "./openrouter-budget-B6nu86e7.js";
import { s as supportsReasoningModel } from "./model-capabilities--LonKxeT.js";
function normalizeError(err, fallback) {
  if (err instanceof Error) return err.message;
  return fallback ?? String(err);
}
const minCompletion = 256;
const absoluteCeiling = 2097152;
const margins = { "incubate": 1536, "compaction": 2048, "agentTurn": 6144, "default": 4096 };
const rawBudget = {
  minCompletion,
  absoluteCeiling,
  margins
};
const CHARS_PER_TOKEN = 3.6;
const MESSAGE_OVERHEAD = 6;
function estimateTextTokens(text) {
  if (!text) return MESSAGE_OVERHEAD;
  return Math.ceil(text.length / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD;
}
function estimatePartsTokens(parts) {
  let n = MESSAGE_OVERHEAD;
  for (const p of parts) {
    if (p.type === "text") n += Math.ceil(p.text.length / CHARS_PER_TOKEN);
    else if (p.type === "image_url") n += 2500;
  }
  return n;
}
function estimateMessageContentTokens(content) {
  if (typeof content === "string") return estimateTextTokens(content);
  return estimatePartsTokens(content);
}
function estimateChatMessagesTokens(messages) {
  let sum = 0;
  for (const m of messages) {
    sum += estimateMessageContentTokens(m.content);
  }
  return Math.ceil(sum * 1.04);
}
const ChatCompletionSuccessSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.union([
        z.string(),
        z.array(z.record(z.string(), z.unknown()))
      ])
    }).passthrough(),
    finish_reason: z.unknown().optional()
  }).passthrough()).min(1),
  usage: z.record(z.string(), z.unknown()).optional()
}).passthrough();
const ModelListSuccessSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())).optional().default([])
}).passthrough();
function extractMessageText(data) {
  const choices = data.choices;
  const message = choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const p = item;
      const typ = p.type;
      if (typ === "text" && typeof p.text === "string") {
        parts.push(p.text);
        continue;
      }
      if (typ === "reasoning") {
        if (typeof p.text === "string") parts.push(p.text);
        else if (typeof p.summary === "string") parts.push(p.summary);
      }
    }
    return parts.join("");
  }
  return "";
}
async function fetchChatCompletion(url, body, errorMap, providerLabel, extraHeaders, signal) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders
  };
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) {
    const errorBody = await response.text();
    const creditMessage = normalizeOpenRouterCreditError(errorBody || `${providerLabel} ${response.status}`);
    if (creditMessage) throw new Error(creditMessage);
    const mapped = errorMap[response.status];
    if (mapped) throw new Error(mapped);
    throw new Error(`${providerLabel} API error (${response.status}): ${errorBody}`);
  }
  const data = await response.json();
  const parsed = ChatCompletionSuccessSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`${providerLabel} API returned an invalid chat completion response`);
  }
  return parsed.data;
}
async function fetchModelList(url, mapFn, extraHeaders) {
  try {
    const response = await fetch(url, extraHeaders ? { headers: extraHeaders } : void 0);
    if (!response.ok) return [];
    const json = await response.json();
    const parsed = ModelListSuccessSchema.safeParse(json);
    if (!parsed.success) return [];
    return mapFn(parsed.data.data);
  } catch {
    return [];
  }
}
function num$1(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : void 0;
}
function parseChatResponse(data) {
  const choices = data.choices;
  const firstChoice = choices?.[0];
  const finishReason = firstChoice?.finish_reason;
  const rawText = extractMessageText(data);
  const usage = data.usage;
  const promptTok = num$1(usage?.prompt_tokens);
  const completionTok = num$1(usage?.completion_tokens);
  const totalTok = num$1(usage?.total_tokens);
  const promptDetails = usage?.prompt_tokens_details;
  const completionDetails = usage?.completion_tokens_details;
  const reasoningTok = num$1(completionDetails?.reasoning_tokens);
  const cachedTok = num$1(promptDetails?.cached_tokens);
  const cost = num$1(usage?.cost);
  const truncated = finishReason === "length";
  const hasUsageNumbers = promptTok !== void 0 || completionTok !== void 0 || totalTok !== void 0 || reasoningTok !== void 0 || cachedTok !== void 0 || cost !== void 0;
  if (!hasUsageNumbers && !truncated) {
    return { raw: rawText };
  }
  const metadata = { truncated };
  if (completionTok !== void 0) {
    metadata.completionTokens = completionTok;
    metadata.tokensUsed = completionTok;
  }
  if (promptTok !== void 0) metadata.promptTokens = promptTok;
  if (totalTok !== void 0) metadata.totalTokens = totalTok;
  if (reasoningTok !== void 0) metadata.reasoningTokens = reasoningTok;
  if (cachedTok !== void 0) metadata.cachedPromptTokens = cachedTok;
  if (cost !== void 0) metadata.costCredits = cost;
  return {
    raw: rawText,
    metadata
  };
}
const __vite_import_meta_env__ = {};
function viteMaxOutputTokensFromEnv() {
  return __vite_import_meta_env__?.VITE_MAX_OUTPUT_TOKENS;
}
function buildChatRequestFromMessages$1(model, messages, extraFields, maxTokens) {
  const envMax = viteMaxOutputTokensFromEnv();
  const resolved = maxTokens ?? (envMax ? parseInt(envMax, 10) : void 0);
  const body = {
    model,
    messages,
    temperature: 0.7,
    ...extraFields
  };
  if (resolved) {
    body.max_tokens = resolved;
  }
  return body;
}
function buildChatRequestFromMessages(model, messages, extraFields, maxTokens) {
  return buildChatRequestFromMessages$1(model, messages, extraFields, maxTokens);
}
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : void 0;
}
function appendDeltaContent(delta, out) {
  const c = delta.content;
  if (typeof c === "string" && c.length > 0) {
    out.acc += c;
    return;
  }
  if (Array.isArray(c)) {
    for (const item of c) {
      if (!item || typeof item !== "object") continue;
      const p = item;
      const typ = p.type;
      if (typ === "text" && typeof p.text === "string") {
        out.acc += p.text;
      } else if (typ === "reasoning") {
        if (typeof p.text === "string") out.acc += p.text;
        else if (typeof p.summary === "string") out.acc += p.summary;
      }
    }
    return;
  }
  const reasoning = delta.reasoning;
  if (typeof reasoning === "string" && reasoning.length > 0) {
    out.acc += reasoning;
  }
}
function usageFromChunk(chunk) {
  const usage = chunk.usage;
  if (!usage) return void 0;
  const o = {};
  const pt = num(usage.prompt_tokens);
  const ct = num(usage.completion_tokens);
  const tt = num(usage.total_tokens);
  if (pt !== void 0) o.promptTokens = pt;
  if (ct !== void 0) {
    o.completionTokens = ct;
    o.tokensUsed = ct;
  }
  if (tt !== void 0) o.totalTokens = tt;
  const pd = usage.prompt_tokens_details;
  const cd = usage.completion_tokens_details;
  const rt = num(cd?.reasoning_tokens);
  const cached = num(pd?.cached_tokens);
  if (rt !== void 0) o.reasoningTokens = rt;
  if (cached !== void 0) o.cachedPromptTokens = cached;
  const cost = num(usage.cost);
  if (cost !== void 0) o.costCredits = cost;
  return Object.keys(o).length > 0 ? o : void 0;
}
async function streamOpenAICompatibleChat(url, body, options, onTextDelta) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options.headers ?? {}
    },
    body: JSON.stringify(body),
    signal: options.signal
  });
  if (!response.ok) {
    const errText = await response.text();
    const creditMessage = normalizeOpenRouterCreditError(errText || `${options.providerLabel} ${response.status}`);
    if (creditMessage) throw new Error(creditMessage);
    const mapped = options.errorMap[response.status];
    if (mapped) throw new Error(mapped);
    throw new Error(`${options.providerLabel} API error (${response.status}): ${errText}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${options.providerLabel}: empty response body`);
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let lastMeta;
  let finishReason;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.replace(/\r$/, "").trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      const err = chunk.error;
      if (err != null) {
        const creditMessage = normalizeOpenRouterCreditError(err);
        if (creditMessage) throw new Error(creditMessage);
        const msg = typeof err === "object" && typeof err.message === "string" ? err.message : normalizeError(err, "stream error");
        throw new Error(`${options.providerLabel}: ${msg}`);
      }
      const usage = usageFromChunk(chunk);
      if (usage) lastMeta = { ...lastMeta, ...usage };
      const choices = chunk.choices;
      const choice0 = choices?.[0];
      if (choice0 && typeof choice0.finish_reason === "string") {
        finishReason = choice0.finish_reason;
      }
      const delta = choice0?.delta;
      if (delta && typeof delta === "object") {
        const before = assembled;
        const bag = { acc: "" };
        appendDeltaContent(delta, bag);
        if (bag.acc.length > 0) {
          assembled += bag.acc;
          if (assembled !== before) {
            await onTextDelta(assembled);
          }
        }
      }
    }
  }
  const truncated = finishReason === "length";
  const meta = lastMeta ? { ...lastMeta, truncated: truncated || lastMeta.truncated } : truncated ? { truncated } : void 0;
  return {
    raw: assembled,
    metadata: meta
  };
}
function levelToEffort(level) {
  switch (level) {
    case "off":
      return null;
    case "minimal":
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
    case "xhigh":
      return "high";
  }
}
function openRouterThinkingFields(thinking) {
  if (!thinking || thinking.level === "off") return {};
  const effort = levelToEffort(thinking.level);
  if (!effort) return {};
  return {
    reasoning: {
      effort,
      max_tokens: thinking.budgetTokens
    }
  };
}
function lmStudioThinkingFields(thinking) {
  if (!thinking || thinking.level === "off") return {};
  const effort = levelToEffort(thinking.level);
  if (!effort) return {};
  return { reasoning_effort: effort };
}
function authHeaders() {
  return {
    "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`
  };
}
class OpenRouterGenerationProvider {
  id = "openrouter";
  name = "OpenRouter";
  description = "Generates HTML code via OpenRouter (Claude, GPT-4o, Gemini, etc.)";
  supportsImages = false;
  supportsParallel = true;
  async listModels() {
    return fetchModelList(
      `${env.OPENROUTER_BASE_URL}/api/v1/models`,
      (models) => models.map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        contextLength: m.context_length,
        supportsVision: typeof m.modality === "string" && m.modality.includes("image"),
        supportsReasoning: supportsReasoningModel(m.id)
      })),
      authHeaders()
    );
  }
  async generateChat(messages, options) {
    const model = options.model || "anthropic/claude-sonnet-4.5";
    const purpose = options.completionPurpose ?? "default";
    const maxTok = await completionMaxTokensForChat("openrouter", model, messages, purpose);
    const thinkingExtras = openRouterThinkingFields(options.thinking);
    const requestBody = buildChatRequestFromMessages(model, messages, thinkingExtras, maxTok);
    const data = await fetchChatCompletion(
      `${env.OPENROUTER_BASE_URL}/api/v1/chat/completions`,
      requestBody,
      {
        401: "Invalid OpenRouter API key.",
        402: "OpenRouter credits are exhausted. This run cannot continue until the budget resets.",
        429: "Rate limit exceeded. Wait a moment and try again."
      },
      "OpenRouter",
      authHeaders(),
      options.signal
    );
    return parseChatResponse(data);
  }
  async generateChatStream(messages, options, onDelta) {
    const model = options.model || "anthropic/claude-sonnet-4.5";
    const purpose = options.completionPurpose ?? "default";
    const maxTok = await completionMaxTokensForChat("openrouter", model, messages, purpose);
    const thinkingExtras = openRouterThinkingFields(options.thinking);
    const requestBody = buildChatRequestFromMessages(
      model,
      messages,
      { stream: true, ...thinkingExtras },
      maxTok
    );
    return streamOpenAICompatibleChat(
      `${env.OPENROUTER_BASE_URL}/api/v1/chat/completions`,
      requestBody,
      {
        headers: authHeaders(),
        signal: options.signal,
        errorMap: {
          401: "Invalid OpenRouter API key.",
          402: "OpenRouter credits are exhausted. This run cannot continue until the budget resets.",
          429: "Rate limit exceeded. Wait a moment and try again."
        },
        providerLabel: "OpenRouter"
      },
      onDelta
    );
  }
  isAvailable() {
    return !!env.OPENROUTER_API_KEY;
  }
}
const CACHE_TTL_MS = 6e4;
let openRouterCache = null;
async function getOpenRouterContextMap() {
  const now = Date.now();
  if (openRouterCache && now - openRouterCache.at < CACHE_TTL_MS) {
    return openRouterCache.contextById;
  }
  const provider = new OpenRouterGenerationProvider();
  const models = await provider.listModels();
  const contextById = /* @__PURE__ */ new Map();
  for (const m of models) {
    if (m.contextLength != null && m.contextLength > 0) {
      contextById.set(m.id, m.contextLength);
    }
  }
  openRouterCache = { at: now, contextById };
  return contextById;
}
async function getProviderModelContextWindow(providerId, modelId) {
  if (providerId !== "openrouter") return void 0;
  const map = await getOpenRouterContextMap();
  return map.get(modelId);
}
const CompletionBudgetFileSchema = z.object({
  minCompletion: z.number().int().min(1),
  absoluteCeiling: z.number().int().min(1),
  margins: z.object({
    incubate: z.number().int().min(0),
    compaction: z.number().int().min(0),
    agentTurn: z.number().int().min(0),
    default: z.number().int().min(0)
  }).strict()
}).strict();
const _budget = CompletionBudgetFileSchema.parse(rawBudget);
const MIN_COMPLETION = _budget.minCompletion;
const ABSOLUTE_CEILING = _budget.absoluteCeiling;
const MARGIN = {
  incubate: _budget.margins.incubate,
  compaction: _budget.margins.compaction,
  agent_turn: _budget.margins.agentTurn,
  default: _budget.margins.default
};
function contextFallback(providerId) {
  return providerId === "lmstudio" ? env.LM_STUDIO_CONTEXT_WINDOW : 131072;
}
function completionBudgetFromPromptTokens(contextWindow, estimatedPromptTokens, purpose, productCap) {
  const cw = Math.max(4096, contextWindow);
  const margin = MARGIN[purpose];
  const prompt = Math.max(0, estimatedPromptTokens);
  const raw = cw - prompt - margin;
  if (raw < MIN_COMPLETION) return void 0;
  let b = Math.min(raw, ABSOLUTE_CEILING);
  if (productCap != null) b = Math.min(b, productCap);
  return Math.max(MIN_COMPLETION, b);
}
async function completionMaxTokensForChat(providerId, modelId, messages, purpose) {
  const registry = await getProviderModelContextWindow(providerId, modelId) ?? contextFallback(providerId);
  const est = estimateChatMessagesTokens(messages);
  return completionBudgetFromPromptTokens(
    registry,
    est,
    purpose,
    env.MAX_OUTPUT_TOKENS
  );
}
const DEFAULT_MODEL = "qwen/qwen3-coder-next";
class LMStudioProvider {
  id = "lmstudio";
  name = "LM Studio (Local)";
  description = "Local inference via LM Studio API";
  supportsImages = false;
  supportsParallel = false;
  async listModels() {
    return fetchModelList(
      `${env.LMSTUDIO_URL}/v1/models`,
      (models) => models.map((m) => {
        const id = m.id;
        return { id, name: id, supportsReasoning: supportsReasoningModel(id) };
      })
    );
  }
  async generateChat(messages, options) {
    const model = options.model || DEFAULT_MODEL;
    const purpose = options.completionPurpose ?? "default";
    const maxTok = await completionMaxTokensForChat("lmstudio", model, messages, purpose);
    const thinkingExtras = lmStudioThinkingFields(options.thinking);
    const requestBody = buildChatRequestFromMessages(
      model,
      messages,
      { stream: false, ...thinkingExtras },
      maxTok
    );
    const data = await fetchChatCompletion(
      `${env.LMSTUDIO_URL}/v1/chat/completions`,
      requestBody,
      { 404: "LM Studio not available. Make sure LM Studio is running and the server is enabled." },
      "LM Studio",
      void 0,
      options.signal
    );
    return parseChatResponse(data);
  }
  async generateChatStream(messages, options, onDelta) {
    const model = options.model || DEFAULT_MODEL;
    const purpose = options.completionPurpose ?? "default";
    const maxTok = await completionMaxTokensForChat("lmstudio", model, messages, purpose);
    const thinkingExtras = lmStudioThinkingFields(options.thinking);
    const requestBody = buildChatRequestFromMessages(
      model,
      messages,
      { stream: true, ...thinkingExtras },
      maxTok
    );
    return streamOpenAICompatibleChat(
      `${env.LMSTUDIO_URL}/v1/chat/completions`,
      requestBody,
      {
        signal: options.signal,
        errorMap: {
          404: "LM Studio not available. Make sure LM Studio is running and the server is enabled."
        },
        providerLabel: "LM Studio"
      },
      onDelta
    );
  }
  isAvailable() {
    return true;
  }
}
const providers = /* @__PURE__ */ new Map();
function registerProvider(provider) {
  providers.set(provider.id, provider);
}
function getProvider(id) {
  return providers.get(id);
}
function getAvailableProviders() {
  return Array.from(providers.values()).filter((p) => p.isAvailable());
}
registerProvider(new OpenRouterGenerationProvider());
registerProvider(new LMStudioProvider());
export {
  getAvailableProviders as a,
  getProviderModelContextWindow as b,
  completionBudgetFromPromptTokens as c,
  estimateTextTokens as e,
  getProvider as g,
  normalizeError as n
};
