import { Hono } from "hono";
import { z } from "zod";
import { i as interpolate, g as getSectionContent, c as collectImageLines, a as generateId, n as now } from "./helpers-BYglHmrq.js";
import { getPromptBody } from "./prompt-resolution-BUm5Krki.js";
import { c as clampProviderModel, S as SSE_EVENT_NAMES } from "./hypothesis-request-schemas-C0hkg4kC.js";
import { p as parseRequestJson } from "./parse-request-BH7y8s49.js";
import { e as extractLlmJsonObjectSegment, p as parseJsonLenient } from "./extract-llm-json-jyDb1ube.js";
import { e as env } from "../[[...route]].js";
import { a as appendIncubateParsedLogEntry } from "./log-store-BzjCnWkn.js";
import { r as runTaskAgentRoute, I as IncubateRequestSchema } from "./request-schemas-LKTCtrnP.js";
import "./feature-flags-XVIYZipX.js";
import "node:fs/promises";
import "node:path";
import "yaml";
import "@mariozechner/pi-ai";
import "@mariozechner/pi-coding-agent";
import "./registry-B7is6TUr.js";
import "./openrouter-budget-B6nu86e7.js";
import "./model-capabilities--LonKxeT.js";
import "just-bash";
import "node:perf_hooks";
import "@sinclair/typebox";
import "node:vm";
import "minimatch";
import "./thinking-defaults-BkNuccwq.js";
import "jsonrepair";
import "@hono/node-server/vercel";
import "hono/cors";
import "hono/body-limit";
import "dotenv";
import "node:fs";
import "hono/streaming";
import "./sse-write-gate-9e2bc412.js";
function imageBlock(spec) {
  const lines = collectImageLines(spec);
  if (lines.length === 0) return "";
  return "## Reference Images\n" + lines.join("\n");
}
function formatReferenceDesignsBlock(referenceDesigns) {
  if (!referenceDesigns || referenceDesigns.length === 0) return "";
  let block = "\n\n## Reference Designs (from previous iterations)\n";
  block += "The following designs were generated in a previous iteration. Analyze their strengths and weaknesses, then propose new hypothesis strategies that improve upon them.\n\n";
  for (const ref of referenceDesigns) {
    block += `### ${ref.name}
\`\`\`
${ref.code}
\`\`\`

`;
  }
  return block;
}
function formatExistingHypothesesBlock(existingStrategies) {
  const existing = existingStrategies;
  if (!existing || existing.length === 0) return "";
  let block = "\n\n## Existing Hypotheses (already explored)\n";
  block += "The following strategies already exist. Do NOT reproduce them. Generate new strategies that explore genuinely different regions of the solution space — not different for novelty, but pushing toward ideas that could outperform these. Every new strategy must still be grounded in the specification's stated needs and research.\n\n";
  for (let i = 0; i < existing.length; i++) {
    const s = existing[i];
    block += `${i + 1}. **${s.name}**
`;
    if (s.hypothesis) block += `   - Hypothesis: ${s.hypothesis}
`;
    if (s.rationale) block += `   - Rationale: ${s.rationale}
`;
    if (s.measurements) block += `   - Measurements: ${s.measurements}
`;
    const dims = Object.entries(s.dimensionValues);
    if (dims.length > 0) {
      block += `   - Dimension values: ${dims.map(([k, v]) => `${k}: ${v}`).join(", ")}
`;
    }
    block += "\n";
  }
  return block;
}
function formatIncubatorHypothesisCountLine(count) {
  if (count == null) return "";
  return `
Produce exactly ${count} new hypothesis strategies.
`;
}
function buildIncubatorUserPrompt(spec, incubatorUserTemplate, referenceDesigns, options) {
  return interpolate(incubatorUserTemplate, {
    SPEC_TITLE: spec.title,
    DESIGN_BRIEF: getSectionContent(spec, "design-brief"),
    EXISTING_DESIGN: getSectionContent(spec, "existing-design"),
    RESEARCH_CONTEXT: getSectionContent(spec, "research-context"),
    OBJECTIVES_METRICS: getSectionContent(spec, "objectives-metrics"),
    DESIGN_CONSTRAINTS: getSectionContent(spec, "design-constraints"),
    IMAGE_BLOCK: imageBlock(spec),
    INTERNAL_CONTEXT_DOCUMENT_BLOCK: formatInternalContextDocumentBlock(options?.internalContextDocument),
    DESIGN_SYSTEM_DOCUMENTS_BLOCK: formatDesignSystemDocumentsBlock(options?.designSystemDocuments),
    REFERENCE_DESIGNS_BLOCK: formatReferenceDesignsBlock(referenceDesigns),
    EXISTING_HYPOTHESES_BLOCK: formatExistingHypothesesBlock(options?.existingStrategies),
    INCUBATOR_HYPOTHESIS_COUNT_LINE: formatIncubatorHypothesisCountLine(options?.count)
  });
}
function formatDesignSystemDocumentsBlock(documents) {
  const docs = documents?.filter((doc) => doc.content.trim());
  if (!docs || docs.length === 0) return "";
  let block = "\n\n## DESIGN.md Documents (optional visual-system context)\n";
  block += "Use these generated DESIGN.md documents as optional visual-system context while forming hypotheses. Respect their tokens, component guidance, and documented uncertainty when present; do not assume a DESIGN.md exists when this block is absent.\n\n";
  for (const doc of docs) {
    block += `### Source: ${doc.title || "Design System"} (${doc.nodeId})

${doc.content.trim()}

`;
  }
  return block;
}
function formatInternalContextDocumentBlock(document) {
  const body = document?.trim();
  if (!body) return "";
  return `

## Internal Context Document (system-generated synthesis)
Use this derived context as an interpretation aid for hypothesis generation. It is grounded in the user inputs but may contain labeled inferences; keep final hypotheses anchored to the specification.

${body}
`;
}
const TEMPLATE_ECHO_PREFIX = /^string\s*[—–-]\s*/i;
function incubationFirstHypothesisEmpty(plan) {
  const h = plan.hypotheses[0];
  if (!h) return true;
  return !h.hypothesis.trim();
}
function incubationLooksLikeTemplateEcho(plan) {
  for (const d of plan.dimensions) {
    if (TEMPLATE_ECHO_PREFIX.test(d.name.trim()) || TEMPLATE_ECHO_PREFIX.test(String(d.range).trim())) {
      return true;
    }
  }
  for (const h of plan.hypotheses) {
    if (TEMPLATE_ECHO_PREFIX.test(h.name.trim()) || TEMPLATE_ECHO_PREFIX.test(h.hypothesis.trim()) || TEMPLATE_ECHO_PREFIX.test(h.rationale.trim())) {
      return true;
    }
  }
  return false;
}
const incubate = new Hono();
const dimensionRangeSchema = z.union([
  z.string(),
  z.array(z.string()).transform((a) => a.join(", "))
]);
const DimensionSchema = z.object({
  name: z.string().default(""),
  range: dimensionRangeSchema.default(""),
  isConstant: z.boolean().default(false)
});
const HypothesisStrategyParseSchema = z.object({
  name: z.string().default("Unnamed Hypothesis"),
  hypothesis: z.string().optional().default(""),
  primaryEmphasis: z.string().optional(),
  rationale: z.string().default(""),
  measurements: z.string().default(""),
  dimensionValues: z.record(z.string(), z.unknown()).optional().default(() => ({}))
}).transform((v) => ({
  id: generateId(),
  name: v.name,
  hypothesis: v.hypothesis || v.primaryEmphasis || "",
  rationale: v.rationale,
  measurements: v.measurements,
  dimensionValues: Object.fromEntries(
    Object.entries(v.dimensionValues ?? {}).map(([k, val]) => [k, String(val)])
  )
}));
const LLMResponseSchema = z.object({
  dimensions: z.array(z.unknown()).default([]).transform(
    (arr) => arr.map((d) => DimensionSchema.parse(typeof d === "object" && d !== null ? d : {}))
  ),
  hypotheses: z.array(z.unknown()).optional(),
  variants: z.array(z.unknown()).optional()
}).transform((obj) => ({
  dimensions: obj.dimensions,
  hypotheses: (obj.hypotheses ?? obj.variants ?? []).map(
    (v) => HypothesisStrategyParseSchema.parse(typeof v === "object" && v !== null ? v : {})
  )
}));
incubate.post("/", async (c) => {
  const parsed = await parseRequestJson(c, IncubateRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };
  const userPromptTemplate = await getPromptBody("incubator-user-inputs");
  const assembledSpec = buildIncubatorUserPrompt(
    body.spec,
    userPromptTemplate,
    body.referenceDesigns,
    {
      ...body.promptOptions,
      internalContextDocument: body.promptOptions?.internalContextDocument ?? body.internalContextDocument,
      designSystemDocuments: body.promptOptions?.designSystemDocuments ?? body.designSystemDocuments
    }
  );
  const agentUserPrompt = `<task>
Analyze the design specification below and produce a dimension map with hypothesis strategies.

Write the complete JSON result to \`result.json\` in the workspace root. The JSON must contain:
- "dimensions": array of { name, range, isConstant }
- "hypotheses": array of { name, hypothesis, rationale, measurements, dimensionValues }

Use the \`use_skill\` tool to load relevant skills before beginning your analysis.
</task>

${assembledSpec}`;
  return runTaskAgentRoute(c, {
    routeLabel: "incubate",
    body,
    userPrompt: agentUserPrompt,
    sessionType: "incubation",
    thinkingTask: "incubate",
    resultFile: "result.json",
    initialProgressMessage: "Incubating spec to hypotheses…",
    debugPayload: (b) => ({
      specSections: Object.keys(b.spec.sections).length,
      hypothesisCount: b.promptOptions?.count
    }),
    onTaskResult: async (taskResult, { write, correlationId }) => {
      const jsonStr = extractLlmJsonObjectSegment(taskResult.result);
      const raw = parseJsonLenient(jsonStr);
      const { dimensions, hypotheses } = LLMResponseSchema.parse(
        typeof raw === "object" && raw !== null ? raw : {}
      );
      const plan = {
        id: generateId(),
        specId: body.spec.id,
        dimensions,
        hypotheses,
        generatedAt: now(),
        incubatorModel: body.modelId
      };
      if (incubationLooksLikeTemplateEcho(plan)) {
        if (env.isDev) {
          console.debug("[incubate] validation failed: template echo", {
            correlationId,
            hypothesisCount: plan.hypotheses.length
          });
        }
        throw new Error(
          "The model returned placeholder text instead of real hypotheses (often from copying a schema example). Try Generate again, or switch model."
        );
      }
      if (incubationFirstHypothesisEmpty(plan)) {
        if (env.isDev) {
          console.debug("[incubate] validation failed: empty hypothesis text", {
            correlationId,
            hypothesisCount: plan.hypotheses.length
          });
        }
        throw new Error(
          "The model returned no hypothesis text (the core bet field was empty). Try Generate again, or switch model."
        );
      }
      const firstBet = plan.hypotheses[0]?.hypothesis ?? "";
      appendIncubateParsedLogEntry({
        correlationId,
        hypothesisCount: plan.hypotheses.length,
        hypothesisNames: plan.hypotheses.map((h) => h.name),
        firstHypothesisText: firstBet,
        dimensionCount: plan.dimensions.length
      });
      if (env.isDev) {
        console.debug("[incubate] plan parsed (before incubate_result SSE)", {
          correlationId,
          hypothesisCount: plan.hypotheses.length,
          hypothesisNames: plan.hypotheses.map((h) => h.name),
          firstHypothesisText: firstBet.length > 400 ? `${firstBet.slice(0, 400)}…` : firstBet,
          dimensionCount: plan.dimensions.length
        });
      }
      await write(SSE_EVENT_NAMES.incubate_result, JSON.parse(JSON.stringify(plan)));
    }
  });
});
export {
  incubate as default
};
