import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { g as getProvider } from "./registry-B7is6TUr.js";
import { G as GenerateStreamBodySchema, e as executeGenerateStreamSafe } from "./generate-execution-BzEnhPwh.js";
import { c as createWriteGate } from "./sse-write-gate-9e2bc412.js";
import { b as applyLockdownToHypothesisContext, P as PromptBundleRequestSchema, H as HypothesisGenerateRequestSchema, a as clampEvaluatorOptional, S as SSE_EVENT_NAMES, n as normalizeProviderError } from "./hypothesis-request-schemas-C0hkg4kC.js";
import { a as THINKING_LEVELS, r as resolveThinkingConfig } from "./thinking-defaults-BkNuccwq.js";
import { c as collectImageLines, g as getSectionContent, i as interpolate, n as now, a as generateId } from "./helpers-BYglHmrq.js";
import { getPromptBody } from "./prompt-resolution-BUm5Krki.js";
import { a as apiJsonError, e as env } from "../[[...route]].js";
import { p as parseRequestJson } from "./parse-request-BH7y8s49.js";
import "zod";
import "./openrouter-budget-B6nu86e7.js";
import "./model-capabilities--LonKxeT.js";
import "node:crypto";
import "./log-store-BzjCnWkn.js";
import "node:fs";
import "node:path";
import "@mariozechner/pi-coding-agent";
import "./evaluation-BqxRe2Wx.js";
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
import "@hono/node-server/vercel";
import "hono/cors";
import "hono/body-limit";
import "dotenv";
const NODE_TYPES = {
  DESIGN_SYSTEM: "designSystem",
  MODEL: "model"
};
function getModelNodeData(node) {
  if (!node || node.type !== NODE_TYPES.MODEL) return void 0;
  return node.data;
}
function getDesignSystemNodeData(node) {
  if (!node || node.type !== NODE_TYPES.DESIGN_SYSTEM) return void 0;
  return node.data;
}
function isThinkingLevel(x) {
  return typeof x === "string" && THINKING_LEVELS.includes(x);
}
function workspaceSnapshotWireToGraph(snapshot) {
  return {
    nodes: snapshot.nodes,
    edges: snapshot.edges
  };
}
function nodeById(snapshot, id) {
  return snapshot.nodes.find((n) => n.id === id);
}
function listIncomingModelCredentialsFromGraph(targetNodeId, snapshot, defaultIncubatorProvider) {
  const out = [];
  for (const e of snapshot.edges) {
    if (e.target !== targetNodeId) continue;
    const src = nodeById(snapshot, e.source);
    if (!src || src.type !== NODE_TYPES.MODEL) continue;
    const md = getModelNodeData(src);
    if (!md?.modelId) continue;
    const providerId = md.providerId || defaultIncubatorProvider;
    const thinkingLevel = (isThinkingLevel(md.thinkingLevel) ? md.thinkingLevel : void 0) ?? "minimal";
    out.push({ providerId, modelId: md.modelId, thinkingLevel });
    break;
  }
  return out;
}
function collectDesignSystemFromDomain(hypothesis2, designSystems) {
  if (!hypothesis2) return { content: void 0, images: [] };
  const parts = [];
  const images = [];
  for (const dsId of hypothesis2.designSystemNodeIds) {
    const ds = designSystems[dsId];
    if (!ds) continue;
    const c = ds.designMdDocument?.content || ds.content || "";
    const t = ds.title || "Design System";
    if (c.trim()) parts.push(`## ${t}
${c}`);
    images.push(...ds.images ?? []);
  }
  return {
    content: parts.join("\n\n---\n\n") || void 0,
    images
  };
}
function collectDesignSystemFromGraph(snapshot, targetNodeId) {
  const incomingEdges = snapshot.edges.filter((e) => e.target === targetNodeId);
  const dsNodes = incomingEdges.map((e) => snapshot.nodes.find((n) => n.id === e.source && n.type === NODE_TYPES.DESIGN_SYSTEM)).filter(Boolean);
  if (dsNodes.length === 0) return { content: void 0, images: [] };
  const parts = dsNodes.map((n) => {
    const data = getDesignSystemNodeData(n);
    const t = data?.title || "Design System";
    const c = data?.designMdDocument?.content || data?.content || "";
    return c.trim() ? `## ${t}
${c}` : "";
  }).filter(Boolean);
  return {
    content: parts.join("\n\n---\n\n") || void 0,
    images: dsNodes.flatMap((n) => getDesignSystemNodeData(n)?.images ?? [])
  };
}
function listModelCredentialsFromDomain(hypothesis2, modelProfiles, defaultIncubatorProvider) {
  if (!hypothesis2) return [];
  const out = [];
  for (const mid of hypothesis2.modelNodeIds.slice(0, 1)) {
    const p = modelProfiles[mid];
    if (!p?.modelId) continue;
    out.push({
      providerId: p.providerId || defaultIncubatorProvider,
      modelId: p.modelId,
      thinkingLevel: p.thinkingLevel ?? "minimal"
    });
  }
  return out;
}
function buildHypothesisGenerationContextFromInputs(input) {
  const { hypothesisNodeId, hypothesisStrategy, spec, snapshot, domainHypothesis } = input;
  let modelCredentials = listModelCredentialsFromDomain(
    domainHypothesis ?? void 0,
    input.modelProfiles,
    input.defaultIncubatorProvider
  );
  if (modelCredentials.length === 0) {
    modelCredentials = listIncomingModelCredentialsFromGraph(
      hypothesisNodeId,
      snapshot,
      input.defaultIncubatorProvider
    );
  }
  if (modelCredentials.length === 0) return null;
  let designSystemContent;
  let designSystemImages = [];
  if (domainHypothesis && domainHypothesis.designSystemNodeIds.length > 0) {
    const ds = collectDesignSystemFromDomain(domainHypothesis, input.designSystems);
    designSystemContent = ds.content;
    designSystemImages = ds.images;
  } else {
    const g = collectDesignSystemFromGraph(snapshot, hypothesisNodeId);
    designSystemContent = g.content;
    designSystemImages = g.images;
  }
  return {
    hypothesisNodeId,
    hypothesisStrategy,
    spec,
    modelCredentials,
    designSystemContent,
    designSystemImages
  };
}
function provenanceFromHypothesisContext(ctx) {
  const s = ctx.hypothesisStrategy;
  return {
    strategies: {
      [s.id]: {
        name: s.name,
        hypothesis: s.hypothesis,
        rationale: s.rationale,
        dimensionValues: s.dimensionValues
      }
    },
    designSystemSnapshot: ctx.designSystemContent || void 0
  };
}
function evaluationPayloadFromHypothesisContext(ctx) {
  const s = ctx.hypothesisStrategy;
  const dv = s.dimensionValues;
  const outputFormat = dv["format"] ?? dv["output_format"] ?? dv["Output format"] ?? dv["Output Format"];
  return {
    strategyName: s.name,
    hypothesis: s.hypothesis,
    rationale: s.rationale,
    measurements: s.measurements,
    dimensionValues: s.dimensionValues,
    objectivesMetrics: ctx.spec.sections["objectives-metrics"]?.content,
    designConstraints: ctx.spec.sections["design-constraints"]?.content,
    designSystemSnapshot: ctx.designSystemContent || void 0,
    ...outputFormat ? { outputFormat: String(outputFormat).trim() } : {}
  };
}
function buildHypothesisPrompt(spec, strategy, hypothesisTemplate, designSystemOverride) {
  const imageDescriptions = collectImageLines(spec).join("\n");
  const dimensionValuesList = Object.entries(strategy.dimensionValues).map(([dim, val]) => `- ${dim}: ${val}`).join("\n");
  const imageBlock = imageDescriptions ? `### Existing Design Reference
${getSectionContent(spec, "existing-design")}

Reference images:
${imageDescriptions}` : "";
  return interpolate(hypothesisTemplate, {
    STRATEGY_NAME: strategy.name,
    HYPOTHESIS: strategy.hypothesis,
    RATIONALE: strategy.rationale,
    MEASUREMENTS: strategy.measurements,
    DIMENSION_VALUES: dimensionValuesList || "(Use your judgment within the exploration space ranges)",
    DESIGN_BRIEF: getSectionContent(spec, "design-brief"),
    RESEARCH_CONTEXT: getSectionContent(spec, "research-context"),
    IMAGE_BLOCK: imageBlock,
    OBJECTIVES_METRICS: getSectionContent(spec, "objectives-metrics"),
    DESIGN_CONSTRAINTS: getSectionContent(spec, "design-constraints"),
    DESIGN_SYSTEM: designSystemOverride ?? getSectionContent(spec, "design-system")
  });
}
function incubateHypothesisPrompts(spec, incubationPlan, hypothesisTemplate, designSystemOverride, extraImages) {
  const allImages = [
    ...Object.values(spec.sections).flatMap((s) => s.images),
    ...extraImages ?? []
  ];
  return incubationPlan.hypotheses.map((strategy) => ({
    id: generateId(),
    strategyId: strategy.id,
    specId: spec.id,
    prompt: buildHypothesisPrompt(spec, strategy, hypothesisTemplate, designSystemOverride),
    images: allImages,
    compiledAt: now()
  }));
}
async function buildHypothesisWorkspaceBundle(body) {
  const ctxRaw = buildHypothesisGenerationContextFromInputs({
    hypothesisNodeId: body.hypothesisNodeId,
    hypothesisStrategy: body.strategy,
    spec: body.spec,
    snapshot: workspaceSnapshotWireToGraph(body.snapshot),
    domainHypothesis: body.domainHypothesis ?? void 0,
    modelProfiles: body.modelProfiles,
    designSystems: body.designSystems,
    defaultIncubatorProvider: body.defaultIncubatorProvider
  });
  if (!ctxRaw) return null;
  const ctx = applyLockdownToHypothesisContext(ctxRaw);
  const hypothesisTemplate = await getPromptBody("designer-hypothesis-inputs");
  const filteredPlan = {
    id: generateId(),
    specId: ctx.spec.id,
    hypotheses: [ctx.hypothesisStrategy],
    generatedAt: now()
  };
  const prompts = incubateHypothesisPrompts(
    ctx.spec,
    filteredPlan,
    hypothesisTemplate,
    ctx.designSystemContent,
    [...ctx.designSystemImages]
  );
  const evaluationContext = evaluationPayloadFromHypothesisContext(ctx);
  const provenance = provenanceFromHypothesisContext(ctx);
  return { ctx, prompts, evaluationContext, provenance };
}
const hypothesis = new Hono();
hypothesis.post("/prompt-bundle", async (c) => {
  const parsed = await parseRequestJson(c, PromptBundleRequestSchema, {
    devWarnLabel: "[hypothesis] POST /prompt-bundle"
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const bundle = await buildHypothesisWorkspaceBundle(body);
  if (!bundle) {
    return apiJsonError(c, 400, "No model credentials for this hypothesis");
  }
  const { ctx, prompts, evaluationContext, provenance } = bundle;
  const evalActive = body.domainHypothesis?.revisionEnabled === true;
  return c.json({
    prompts,
    evaluationContext: evalActive ? evaluationContext ?? null : null,
    provenance,
    generationContext: {
      modelCredentials: ctx.modelCredentials.map((cred) => ({
        providerId: cred.providerId,
        modelId: cred.modelId,
        thinkingLevel: cred.thinkingLevel
      }))
    }
  });
});
hypothesis.post("/generate", async (c) => {
  const parsed = await parseRequestJson(c, HypothesisGenerateRequestSchema, {
    devWarnLabel: "[hypothesis] POST /generate"
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const bundle = await buildHypothesisWorkspaceBundle(body);
  if (!bundle) {
    return apiJsonError(c, 400, "No model credentials for this hypothesis");
  }
  const { ctx, prompts, evaluationContext } = bundle;
  if (prompts.length === 0) {
    return apiJsonError(c, 400, "No prompts to generate");
  }
  const prompt = prompts[0];
  const modelCredentials = [...ctx.modelCredentials];
  const parallel = modelCredentials.every((cred) => getProvider(cred.providerId)?.supportsParallel ?? false);
  const evaluatorClamp = clampEvaluatorOptional(body.evaluatorProviderId, body.evaluatorModelId);
  const evalActive = body.domainHypothesis?.revisionEnabled === true;
  const effectiveEvaluationContext = evalActive ? evaluationContext : null;
  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let id = 0;
    const allocId = () => String(id++);
    const gate = createWriteGate();
    const baseCorrelation = body.correlationId?.trim() || crypto.randomUUID();
    if (env.isDev) {
      console.debug("[hypothesis/generate] request", {
        correlationId: baseCorrelation,
        lanes: modelCredentials.length,
        promptChars: prompt.prompt.length,
        evalContext: effectiveEvaluationContext === null ? "build_only" : "eval"
      });
    }
    const base = {
      prompt: prompt.prompt,
      supportsVision: body.supportsVision,
      evaluatorProviderId: evaluatorClamp.evaluatorProviderId,
      evaluatorModelId: evaluatorClamp.evaluatorModelId,
      agenticMaxRevisionRounds: body.agenticMaxRevisionRounds,
      agenticMinOverallScore: body.agenticMinOverallScore,
      rubricWeights: body.rubricWeights
    };
    const runLane = async (laneIndex, cred) => {
      const laneThinking = resolveThinkingConfig("design", cred.modelId, { level: cred.thinkingLevel });
      const streamBody = GenerateStreamBodySchema.parse({
        ...base,
        thinkingLevel: laneThinking.level,
        thinking: laneThinking,
        evaluationContext: effectiveEvaluationContext,
        providerId: cred.providerId,
        modelId: cred.modelId,
        correlationId: `${baseCorrelation}:lane-${laneIndex}`
      });
      await executeGenerateStreamSafe(stream, streamBody, abortSignal, {
        allocId,
        laneIndex,
        laneEndMode: "lane_done",
        writeGate: gate,
        correlationId: `${baseCorrelation}:lane-${laneIndex}`
      });
    };
    try {
      if (parallel) {
        await Promise.all(
          modelCredentials.map((cred, i) => runLane(i, cred))
        );
      } else {
        for (let i = 0; i < modelCredentials.length; i++) {
          const cred = modelCredentials[i];
          await runLane(i, cred);
        }
      }
      await gate.enqueue(async () => {
        await stream.writeSSE({ data: "{}", event: SSE_EVENT_NAMES.done, id: allocId() });
      });
    } catch (err) {
      await gate.enqueue(async () => {
        await stream.writeSSE({
          data: JSON.stringify({ error: normalizeProviderError(err) }),
          event: SSE_EVENT_NAMES.error,
          id: allocId()
        });
        await stream.writeSSE({ data: "{}", event: SSE_EVENT_NAMES.done, id: allocId() });
      });
    }
  });
});
export {
  hypothesis as default
};
