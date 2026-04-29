import { Hono } from "hono";
import { c as clampProviderModel, S as SSE_EVENT_NAMES } from "./hypothesis-request-schemas-C0hkg4kC.js";
import { p as parseRequestJson } from "./parse-request-BH7y8s49.js";
import { D as DesignSystemExtractRequestSchema, r as runTaskAgentRoute } from "./request-schemas-LKTCtrnP.js";
import "./feature-flags-XVIYZipX.js";
import "zod";
import "../[[...route]].js";
import "@hono/node-server/vercel";
import "hono/cors";
import "hono/body-limit";
import "dotenv";
import "node:path";
import "node:fs/promises";
import "yaml";
import "@mariozechner/pi-ai";
import "@mariozechner/pi-coding-agent";
import "./registry-B7is6TUr.js";
import "./openrouter-budget-B6nu86e7.js";
import "./model-capabilities--LonKxeT.js";
import "just-bash";
import "node:perf_hooks";
import "./log-store-BzjCnWkn.js";
import "node:fs";
import "@sinclair/typebox";
import "node:vm";
import "minimatch";
import "./thinking-defaults-BkNuccwq.js";
import "hono/streaming";
import "./sse-write-gate-9e2bc412.js";
function asSeverity(value) {
  return value === "error" || value === "warning" || value === "info" ? value : "info";
}
function normalizeLintReport(report) {
  const findings = report.findings?.map((finding) => ({
    severity: asSeverity(finding.severity),
    message: typeof finding.message === "string" ? finding.message : "Unknown DESIGN.md lint finding"
  })) ?? [];
  const counted = {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    infos: findings.filter((f) => f.severity === "info").length
  };
  return {
    errors: typeof report.summary?.errors === "number" ? report.summary.errors : counted.errors,
    warnings: typeof report.summary?.warnings === "number" ? report.summary.warnings : counted.warnings,
    infos: typeof report.summary?.infos === "number" ? report.summary.infos : counted.infos,
    findings
  };
}
async function lintDesignMdDocument(content) {
  const mod = await import("@google/design.md/linter");
  return normalizeLintReport(mod.lint(content));
}
const designSystem = new Hono();
designSystem.post("/extract", async (c) => {
  const parsed = await parseRequestJson(c, DesignSystemExtractRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };
  const imageDescriptions = (body.images ?? []).map((img, i) => {
    const name = img.name ?? img.filename ?? `screenshot-${i + 1}`;
    return `Image ${i + 1}: ${name}${img.description ? ` — ${img.description}` : ""}`;
  }).join("\n");
  const agentUserPrompt = `<task>
Create a Google DESIGN.md document from the provided design-system source material.

Use the \`use_skill\` tool to load the relevant DESIGN.md extraction skill before beginning. Treat that skill as the authoritative contract for the Google/Stitch DESIGN.md schema, section order, inference policy, and lint-friendly output.

Analyze the written source material and any UI screenshots, then write the complete Markdown document to \`DESIGN.md\` in the workspace root.
</task>

<design_system_title>
${body.title ?? "Design System"}
</design_system_title>

<source_hash>
${body.sourceHash ?? "(not provided)"}
</source_hash>

<written_source>
${body.content?.trim() ?? ""}
</written_source>

<screenshots>
${imageDescriptions}
</screenshots>

Generate DESIGN.md from this design-system source.`;
  return runTaskAgentRoute(c, {
    routeLabel: "design-system",
    body,
    userPrompt: agentUserPrompt,
    sessionType: "design-system",
    thinkingTask: "design-system",
    resultFile: "DESIGN.md",
    initialProgressMessage: "Generating DESIGN.md…",
    debugPayload: (b) => ({
      imageCount: b.images?.length ?? 0,
      hasText: Boolean(b.content?.trim())
    }),
    onTaskResult: async (taskResult, { write }) => {
      const result = taskResult.result.trim();
      const lint = await lintDesignMdDocument(result);
      if (lint.errors > 0) {
        throw new Error(
          `Generated DESIGN.md failed lint with ${lint.errors} error${lint.errors === 1 ? "" : "s"}.`
        );
      }
      await write(SSE_EVENT_NAMES.task_result, { result, lint });
    }
  });
});
export {
  designSystem as default
};
