import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getProvider } from '../services/providers/registry.ts';
import {
  createWriteGate,
  executeGenerateStreamSafe,
} from '../services/generate-execution.ts';
import { GenerateStreamBodySchema } from '../lib/generate-stream-schema.ts';
import { normalizeError } from '../lib/error-utils.ts';
import { clampEvaluatorOptional } from '../lib/lockdown-model.ts';
import { buildHypothesisWorkspaceBundle } from '../lib/hypothesis-workspace.ts';
import {
  HypothesisGenerateRequestSchema,
  PromptBundleRequestSchema,
} from '../lib/hypothesis-schemas.ts';

const hypothesis = new Hono();

hypothesis.post('/prompt-bundle', async (c) => {
  const raw = await c.req.json();
  const parsed = PromptBundleRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[hypothesis] POST /prompt-bundle validation failed', details);
    }
    return c.json({ error: 'Invalid request', details }, 400);
  }
  const body = parsed.data;

  const bundle = await buildHypothesisWorkspaceBundle(body);
  if (!bundle) {
    return c.json({ error: 'No model credentials for this hypothesis' }, 400);
  }
  const { ctx, prompts, evaluationContext, provenance } = bundle;

  return c.json({
    prompts,
    evaluationContext: evaluationContext ?? null,
    provenance,
    generationContext: {
      agentMode: ctx.agentMode,
      modelCredentials: ctx.modelCredentials.map((cred) => ({
        providerId: cred.providerId,
        modelId: cred.modelId,
        thinkingLevel: cred.thinkingLevel,
      })),
    },
  });
});

hypothesis.post('/generate', async (c) => {
  const raw = await c.req.json();
  const parsed = HypothesisGenerateRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[hypothesis] POST /generate validation failed', details);
    }
    return c.json({ error: 'Invalid request', details }, 400);
  }
  const body = parsed.data;

  const bundle = await buildHypothesisWorkspaceBundle(body);
  if (!bundle) {
    return c.json({ error: 'No model credentials for this hypothesis' }, 400);
  }
  const { ctx, prompts, evaluationContext } = bundle;
  if (prompts.length === 0) {
    return c.json({ error: 'No prompts to generate' }, 400);
  }
  const prompt = prompts[0]!;
  const modelCredentials = [...ctx.modelCredentials];
  const parallel = modelCredentials.every((cred) => getProvider(cred.providerId)?.supportsParallel ?? false);
  const evaluatorClamp = clampEvaluatorOptional(body.evaluatorProviderId, body.evaluatorModelId);

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let id = 0;
    const allocId = () => String(id++);
    const gate = createWriteGate();

    const baseCorrelation =
      body.correlationId?.trim() || crypto.randomUUID();

    const base = {
      prompt: prompt.prompt,
      supportsVision: body.supportsVision,
      evaluatorProviderId: evaluatorClamp.evaluatorProviderId,
      evaluatorModelId: evaluatorClamp.evaluatorModelId,
      agenticMaxRevisionRounds: body.agenticMaxRevisionRounds,
      agenticMinOverallScore: body.agenticMinOverallScore,
    };

    const runLane = async (
      laneIndex: number,
      cred: { providerId: string; modelId: string; thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' },
    ) => {
      const streamBody = GenerateStreamBodySchema.parse({
        ...base,
        thinkingLevel: cred.thinkingLevel,
        mode: ctx.agentMode,
        evaluationContext: ctx.agentMode === 'agentic' ? evaluationContext : undefined,
        providerId: cred.providerId,
        modelId: cred.modelId,
        correlationId: `${baseCorrelation}:lane-${laneIndex}`,
      });
      await executeGenerateStreamSafe(stream, streamBody, abortSignal, {
        allocId,
        laneIndex,
        laneEndMode: 'lane_done',
        writeGate: gate,
        correlationId: `${baseCorrelation}:lane-${laneIndex}`,
      });
    };

    try {
      if (parallel) {
        await Promise.all(
          modelCredentials.map((cred, i) => runLane(i, cred)),
        );
      } else {
        for (let i = 0; i < modelCredentials.length; i++) {
          const cred = modelCredentials[i]!;
          await runLane(i, cred);
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
