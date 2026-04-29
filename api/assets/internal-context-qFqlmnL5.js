import { Hono } from "hono";
import { c as clampProviderModel, S as SSE_EVENT_NAMES } from "./hypothesis-request-schemas-C0hkg4kC.js";
import { p as parseRequestJson } from "./parse-request-BH7y8s49.js";
import { b as InternalContextGenerateRequestSchema, r as runTaskAgentRoute } from "./request-schemas-LKTCtrnP.js";
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
const SOURCE_SECTION_IDS = [
  "design-brief",
  "existing-design",
  "research-context",
  "objectives-metrics",
  "design-constraints"
];
function appendBlock(lines, tag, body) {
  const t = body?.trim();
  if (!t) return;
  lines.push(`<${tag}>
${t}
</${tag}>`);
}
function appendImageBlock(lines, spec) {
  const rows = [];
  for (const sectionId of SOURCE_SECTION_IDS) {
    const section = spec.sections[sectionId];
    for (const image of section?.images ?? []) {
      rows.push(
        `- ${sectionId}: ${image.filename}${image.description ? ` — ${image.description}` : ""}${image.extractedContext ? ` (${image.extractedContext})` : ""}`
      );
    }
  }
  if (rows.length > 0) lines.push(`<reference_images>
${rows.join("\n")}
</reference_images>`);
}
function buildInternalContextUserMessage(spec) {
  const lines = [
    "Synthesize an internal design context document from the following user-provided inputs.",
    `<canvas_title>${spec.title}</canvas_title>`
  ];
  appendBlock(lines, "design_brief", spec.sections["design-brief"]?.content);
  appendBlock(lines, "existing_design", spec.sections["existing-design"]?.content);
  appendBlock(lines, "research_context", spec.sections["research-context"]?.content);
  appendBlock(lines, "objectives_metrics", spec.sections["objectives-metrics"]?.content);
  appendBlock(lines, "design_constraints", spec.sections["design-constraints"]?.content);
  appendImageBlock(lines, spec);
  return lines.join("\n\n");
}
const internalContext = new Hono();
internalContext.post("/generate", async (c) => {
  const parsed = await parseRequestJson(c, InternalContextGenerateRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };
  const contextMessage = buildInternalContextUserMessage(body.spec);
  const agentUserPrompt = `<task>
Create an internal design context document from the specification inputs below.

Write the final Markdown document to \`result.md\` in the workspace root.
The output should be ready for a designer to inspect and for the Incubator to use as context — no JSON wrapping, no markdown code fences around the whole document, no meta commentary before or after the document.

Use the \`use_skill\` tool to load relevant skills before generating.
</task>

<source_hash>${body.sourceHash}</source_hash>

${contextMessage}`;
  return runTaskAgentRoute(c, {
    routeLabel: "internal-context",
    body,
    userPrompt: agentUserPrompt,
    sessionType: "internal-context",
    thinkingTask: "internal-context",
    resultFile: "result.md",
    initialProgressMessage: "Synthesizing internal context…",
    debugPayload: (b) => ({ sourceHash: b.sourceHash }),
    onTaskResult: async (taskResult, { write }) => {
      await write(SSE_EVENT_NAMES.task_result, { result: taskResult.result.trim() });
    }
  });
});
export {
  internalContext as default
};
