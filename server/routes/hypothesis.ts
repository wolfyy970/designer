import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { DesignSpecSchema } from '../../src/types/spec.ts';
import { DomainDesignSystemContentSchema } from '../../src/lib/domain-design-system-schema.ts';
import { compileVariantPrompts } from '../services/compiler.ts';
import { getPromptBody } from '../db/prompts.ts';
import { generateId, now } from '../lib/utils.ts';
import { getProvider } from '../services/providers/registry.ts';
import {
  createWriteGate,
  executeGenerateStreamSafe,
} from '../services/generate-execution.ts';
import { GenerateStreamBodySchema } from '../lib/generate-stream-schema.ts';
import { WorkspaceSnapshotSchema } from '../../src/lib/workspace-snapshot-schema.ts';
import { normalizeError } from '../lib/error-utils.ts';
import {
  buildHypothesisGenerationContextFromInputs,
  evaluationPayloadFromHypothesisContext,
  provenanceFromHypothesisContext,
  workspaceSnapshotWireToGraph,
} from '../../src/workspace/hypothesis-generation-pure.ts';

const hypothesis = new Hono();

const DomainHypothesisSchema = z.object({
  id: z.string(),
  incubatorId: z.string(),
  variantStrategyId: z.string(),
  modelNodeIds: z.array(z.string()),
  designSystemNodeIds: z.array(z.string()),
  agentMode: z.enum(['single', 'agentic']),
  thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high']).optional(),
  placeholder: z.boolean(),
});

const DomainModelProfileSchema = z.object({
  nodeId: z.string(),
  providerId: z.string(),
  modelId: z.string(),
  title: z.string().optional(),
});

const VariantStrategySchema = z.object({
  id: z.string(),
  name: z.string(),
  hypothesis: z.string(),
  rationale: z.string(),
  measurements: z.string(),
  dimensionValues: z.record(z.string(), z.string()),
});

const HypothesisWorkspaceCoreSchema = z.object({
  hypothesisNodeId: z.string().min(1),
  variantStrategy: VariantStrategySchema,
  spec: DesignSpecSchema,
  snapshot: WorkspaceSnapshotSchema,
  domainHypothesis: DomainHypothesisSchema.nullish(),
  modelProfiles: z.record(z.string(), DomainModelProfileSchema),
  designSystems: z.record(z.string(), DomainDesignSystemContentSchema),
  defaultCompilerProvider: z.string().min(1),
});

const PromptBundleRequestSchema = HypothesisWorkspaceCoreSchema;

const HypothesisGenerateRequestSchema = HypothesisWorkspaceCoreSchema.extend({
  supportsVision: z.boolean().optional(),
  evaluatorProviderId: z.string().optional(),
  evaluatorModelId: z.string().optional(),
  agenticMaxRevisionRounds: z.number().int().min(0).max(20).optional(),
  agenticMinOverallScore: z.number().min(0).max(5).optional(),
  thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high']).optional(),
});

hypothesis.post('/prompt-bundle', async (c) => {
  const raw = await c.req.json();
  const parsed = PromptBundleRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }
  const body = parsed.data;

  const ctx = buildHypothesisGenerationContextFromInputs({
    hypothesisNodeId: body.hypothesisNodeId,
    variantStrategy: body.variantStrategy,
    spec: body.spec,
    snapshot: workspaceSnapshotWireToGraph(body.snapshot),
    domainHypothesis: body.domainHypothesis ?? undefined,
    modelProfiles: body.modelProfiles,
    designSystems: body.designSystems,
    defaultCompilerProvider: body.defaultCompilerProvider,
  });
  if (!ctx) {
    return c.json({ error: 'No model credentials for this hypothesis' }, 400);
  }

  const variantTemplate = await getPromptBody('variant');
  const filteredMap = {
    id: generateId(),
    specId: ctx.spec.id,
    dimensions: [],
    variants: [ctx.variantStrategy],
    generatedAt: now(),
    compilerModel: 'merged',
  };

  const prompts = compileVariantPrompts(
    ctx.spec,
    filteredMap,
    variantTemplate,
    ctx.designSystemContent,
    [...ctx.designSystemImages],
  );

  const evaluationContext = evaluationPayloadFromHypothesisContext(ctx);
  const provenance = provenanceFromHypothesisContext(ctx);

  return c.json({
    prompts,
    evaluationContext: evaluationContext ?? null,
    provenance,
    generationContext: {
      agentMode: ctx.agentMode,
      thinkingLevel: ctx.thinkingLevel,
      modelCredentials: [...ctx.modelCredentials],
    },
  });
});

hypothesis.post('/generate', async (c) => {
  const raw = await c.req.json();
  const parsed = HypothesisGenerateRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }
  const body = parsed.data;

  const ctx = buildHypothesisGenerationContextFromInputs({
    hypothesisNodeId: body.hypothesisNodeId,
    variantStrategy: body.variantStrategy,
    spec: body.spec,
    snapshot: workspaceSnapshotWireToGraph(body.snapshot),
    domainHypothesis: body.domainHypothesis ?? undefined,
    modelProfiles: body.modelProfiles,
    designSystems: body.designSystems,
    defaultCompilerProvider: body.defaultCompilerProvider,
  });
  if (!ctx) {
    return c.json({ error: 'No model credentials for this hypothesis' }, 400);
  }

  const variantTemplate = await getPromptBody('variant');
  const filteredMap = {
    id: generateId(),
    specId: ctx.spec.id,
    dimensions: [],
    variants: [ctx.variantStrategy],
    generatedAt: now(),
    compilerModel: 'merged',
  };
  const prompts = compileVariantPrompts(
    ctx.spec,
    filteredMap,
    variantTemplate,
    ctx.designSystemContent,
    [...ctx.designSystemImages],
  );
  if (prompts.length === 0) {
    return c.json({ error: 'No prompts to generate' }, 400);
  }
  const prompt = prompts[0]!;
  const evaluationContext = evaluationPayloadFromHypothesisContext(ctx);

  const mode = ctx.agentMode;
  const thinkingLevel = body.thinkingLevel ?? ctx.thinkingLevel;

  const modelCredentials = [...ctx.modelCredentials];
  const parallel = modelCredentials.every((cred) => getProvider(cred.providerId)?.supportsParallel ?? false);

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let id = 0;
    const allocId = () => String(id++);
    const gate = createWriteGate();

    const base = {
      prompt: prompt.prompt,
      supportsVision: body.supportsVision,
      mode,
      thinkingLevel,
      evaluationContext,
      evaluatorProviderId: body.evaluatorProviderId,
      evaluatorModelId: body.evaluatorModelId,
      agenticMaxRevisionRounds: body.agenticMaxRevisionRounds,
      agenticMinOverallScore: body.agenticMinOverallScore,
    };

    const runLane = async (laneIndex: number, providerId: string, modelId: string) => {
      const streamBody = GenerateStreamBodySchema.parse({
        ...base,
        providerId,
        modelId,
      });
      await executeGenerateStreamSafe(stream, streamBody, abortSignal, {
        allocId,
        laneIndex,
        laneEndMode: 'lane_done',
        writeGate: gate,
      });
    };

    try {
      if (parallel) {
        await Promise.all(
          modelCredentials.map((cred, i) => runLane(i, cred.providerId, cred.modelId)),
        );
      } else {
        for (let i = 0; i < modelCredentials.length; i++) {
          const cred = modelCredentials[i]!;
          await runLane(i, cred.providerId, cred.modelId);
        }
      }
      await gate.enqueue(async () => {
        await stream.writeSSE({ data: '{}', event: 'done', id: allocId() });
      });
    } catch (err) {
      await gate.enqueue(async () => {
        await stream.writeSSE({
          data: JSON.stringify({ error: normalizeError(err) }),
          event: 'error',
          id: allocId(),
        });
      });
    }
  });
});

export default hypothesis;
