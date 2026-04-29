import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { e as env } from "../[[...route]].js";
import { G as GenerateStreamBodySchema, e as executeGenerateStreamSafe } from "./generate-execution-BzEnhPwh.js";
import { p as parseRequestJson } from "./parse-request-BH7y8s49.js";
import { c as clampProviderModel, a as clampEvaluatorOptional } from "./hypothesis-request-schemas-C0hkg4kC.js";
import "@hono/node-server/vercel";
import "hono/cors";
import "hono/body-limit";
import "dotenv";
import "node:path";
import "zod";
import "./thinking-defaults-BkNuccwq.js";
import "./model-capabilities--LonKxeT.js";
import "node:crypto";
import "./registry-B7is6TUr.js";
import "./openrouter-budget-B6nu86e7.js";
import "./log-store-BzjCnWkn.js";
import "node:fs";
import "@mariozechner/pi-coding-agent";
import "./evaluation-BqxRe2Wx.js";
import "./prompt-resolution-BUm5Krki.js";
import "node:perf_hooks";
import "node:vm";
import "./preview-session-store-YT8vDwgJ.js";
import "playwright";
import "./extract-llm-json-jyDb1ube.js";
import "jsonrepair";
import "node:fs/promises";
import "./feature-flags-XVIYZipX.js";
import "yaml";
import "@mariozechner/pi-ai";
import "just-bash";
import "@sinclair/typebox";
import "minimatch";
const generate = new Hono();
generate.post("/", async (c) => {
  const parsed = await parseRequestJson(c, GenerateStreamBodySchema, {
    devWarnLabel: "[generate]"
  });
  if (!parsed.ok) return parsed.response;
  const m = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const ev = clampEvaluatorOptional(parsed.data.evaluatorProviderId, parsed.data.evaluatorModelId);
  const body = { ...parsed.data, ...ev, providerId: m.providerId, modelId: m.modelId };
  const correlationId = body.correlationId?.trim() || crypto.randomUUID();
  if (env.isDev) {
    console.debug("[generate] request", {
      correlationId,
      provider: body.providerId,
      model: body.modelId,
      promptChars: body.prompt.length,
      evalContext: body.evaluationContext === null ? "build_only" : "eval"
    });
  }
  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let id = 0;
    const allocId = () => String(id++);
    await executeGenerateStreamSafe(stream, body, abortSignal, {
      allocId,
      correlationId
    });
  });
});
export {
  generate as default
};
