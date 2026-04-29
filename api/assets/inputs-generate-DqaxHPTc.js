import { Hono } from "hono";
import { c as clampProviderModel, S as SSE_EVENT_NAMES } from "./hypothesis-request-schemas-C0hkg4kC.js";
import { p as parseRequestJson } from "./parse-request-BH7y8s49.js";
import { a as InputsGenerateRequestSchema, r as runTaskAgentRoute } from "./request-schemas-LKTCtrnP.js";
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
function appendBlock(lines, tag, body) {
  const t = body?.trim();
  if (!t) return;
  lines.push(`<${tag}>
${t}
</${tag}>`);
}
function buildInputsGenerateUserMessage(input) {
  const lines = [
    "Using the following inputs, produce the body text for <target_input> only, following your system rules.",
    `<target_input>${input.targetInput}</target_input>`,
    `<design_brief>
${input.designBrief.trim()}
</design_brief>`
  ];
  appendBlock(lines, "existing_design", input.existingDesign);
  if (input.targetInput !== "research-context") {
    appendBlock(lines, "research_context", input.researchContext);
  }
  if (input.targetInput !== "objectives-metrics") {
    appendBlock(lines, "objectives_metrics", input.objectivesMetrics);
  }
  if (input.targetInput !== "design-constraints") {
    appendBlock(lines, "design_constraints", input.designConstraints);
  }
  const targetDraft = input.targetInput === "research-context" ? input.researchContext : input.targetInput === "objectives-metrics" ? input.objectivesMetrics : input.designConstraints;
  appendBlock(lines, "current_input_draft", targetDraft);
  return lines.join("\n\n");
}
const inputsGenerate = new Hono();
const INPUT_LABELS = {
  "research-context": "Research & Context",
  "objectives-metrics": "Objectives & Metrics",
  "design-constraints": "Design Constraints"
};
inputsGenerate.post("/generate", async (c) => {
  const parsed = await parseRequestJson(c, InputsGenerateRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };
  const contextMessage = buildInputsGenerateUserMessage({
    targetInput: body.inputId,
    designBrief: body.designBrief,
    existingDesign: body.existingDesign,
    researchContext: body.researchContext,
    objectivesMetrics: body.objectivesMetrics,
    designConstraints: body.designConstraints
  });
  const label = INPUT_LABELS[body.inputId] ?? body.inputId;
  const agentUserPrompt = `<task>
Generate the **${label}** section content for a design specification.

Write the result as plain text to \`result.txt\` in the workspace root.
The output should be ready to paste into a textarea — no JSON wrapping, no markdown code fences, no meta commentary.

Use the \`use_skill\` tool to load relevant skills before generating.
</task>

${contextMessage}`;
  return runTaskAgentRoute(c, {
    routeLabel: "inputs-generate",
    body,
    userPrompt: agentUserPrompt,
    sessionType: "inputs-gen",
    thinkingTask: "inputs",
    resultFile: "result.txt",
    resultFileFallback: "firstNonEmptyFile",
    initialProgressMessage: `Generating ${label}…`,
    debugPayload: (b) => ({
      inputId: b.inputId,
      designBriefChars: b.designBrief.length
    }),
    onTaskResult: async (taskResult, { write }) => {
      await write(SSE_EVENT_NAMES.task_result, { result: taskResult.result.trim() });
    }
  });
});
export {
  inputsGenerate as default
};
