import { Hono } from "hono";
import { O as OpenRouterBudgetStatusResponseSchema } from "./wire-schemas-MuEb8lng.js";
import { z } from "zod";
import { n as normalizeOpenRouterCreditError, O as OPENROUTER_CREDIT_EXHAUSTED_MESSAGE } from "./openrouter-budget-B6nu86e7.js";
import { e as env } from "../[[...route]].js";
import "./thinking-defaults-BkNuccwq.js";
import "./model-capabilities--LonKxeT.js";
import "@hono/node-server/vercel";
import "hono/cors";
import "hono/body-limit";
import "dotenv";
import "node:path";
const OpenRouterKeyResponseSchema = z.object({
  data: z.object({
    limit: z.number().nullable(),
    limit_remaining: z.number().nullable(),
    limit_reset: z.enum(["daily", "weekly", "monthly"]).nullable(),
    usage_daily: z.number().optional()
  }).passthrough()
}).passthrough();
function iso(date) {
  return date.toISOString();
}
function nextOpenRouterResetAt(limitReset, now = /* @__PURE__ */ new Date()) {
  if (limitReset === null) return void 0;
  const next = new Date(now.getTime());
  next.setUTCHours(0, 0, 0, 0);
  if (limitReset === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
    return iso(next);
  }
  if (limitReset === "weekly") {
    const day = next.getUTCDay();
    const daysUntilMonday = day === 0 ? 1 : 8 - day;
    next.setUTCDate(next.getUTCDate() + daysUntilMonday);
    return iso(next);
  }
  next.setUTCMonth(next.getUTCMonth() + 1, 1);
  return iso(next);
}
function baseStatus(status, checkedAt, message) {
  return { status, checkedAt, message };
}
async function getOpenRouterBudgetStatus(options) {
  const apiKey = env.OPENROUTER_API_KEY;
  const baseUrl = env.OPENROUTER_BASE_URL.replace(/\/$/, "");
  const now = /* @__PURE__ */ new Date();
  const checkedAt = iso(now);
  const fetchImpl = fetch;
  if (!apiKey.trim()) {
    return baseStatus("not_configured", checkedAt, "OpenRouter is not configured.");
  }
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/api/v1/key`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
  } catch {
    return baseStatus("unknown", checkedAt, "Could not check OpenRouter credits.");
  }
  if (response.status === 429) {
    return baseStatus("rate_limited", checkedAt, "OpenRouter credit check is rate limited.");
  }
  if (!response.ok) {
    let text = "";
    try {
      text = await response.text();
    } catch {
      text = "";
    }
    const creditMessage = normalizeOpenRouterCreditError(text || `OpenRouter API error (${response.status})`);
    if (creditMessage) {
      return baseStatus("out_of_credits", checkedAt, creditMessage);
    }
    return baseStatus("unknown", checkedAt, "Could not check OpenRouter credits.");
  }
  let json;
  try {
    json = await response.json();
  } catch {
    return baseStatus("unknown", checkedAt, "Could not check OpenRouter credits.");
  }
  const parsed = OpenRouterKeyResponseSchema.safeParse(json);
  if (!parsed.success) {
    return baseStatus("unknown", checkedAt, "Could not check OpenRouter credits.");
  }
  const key = parsed.data.data;
  const resetAt = nextOpenRouterResetAt(key.limit_reset, now);
  const status = key.limit_remaining !== null && key.limit_remaining <= 0 ? "out_of_credits" : "available";
  return {
    status,
    limit: key.limit,
    limitRemaining: key.limit_remaining,
    limitReset: key.limit_reset,
    usageDaily: key.usage_daily,
    resetAt,
    checkedAt,
    message: status === "out_of_credits" ? OPENROUTER_CREDIT_EXHAUSTED_MESSAGE : "OpenRouter credits are available."
  };
}
const providerStatus = new Hono();
providerStatus.get("/openrouter", async (c) => {
  const status = await getOpenRouterBudgetStatus();
  return c.json(OpenRouterBudgetStatusResponseSchema.parse(status));
});
export {
  providerStatus as default
};
