import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { getProvider } from '../services/providers/registry.ts';
import {
  createWriteGate,
  executeGenerateStreamSafe,
} from '../services/generate-execution.ts';
import { GenerateStreamBodySchema } from '../lib/generate-stream-schema.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { clampEvaluatorOptional } from '../lib/lockdown-model.ts';
import { buildHypothesisWorkspaceBundle } from '../lib/hypothesis-workspace.ts';
import {
  HypothesisGenerateRequestSchema,
  PromptBundleRequestSchema,
} from '../lib/hypothesis-schemas.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import { apiJsonError } from '../lib/api-json-error.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { env } from '../env.ts';

const hypothesis = new Hono();

hypothesis.post('/prompt-bundle', async (c) => {
  const parsed = await parseRequestJson(c, PromptBundleRequestSchema, {
    devWarnLabel: '[hypothesis] POST /prompt-bundle',
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const bundle = await buildHypothesisWorkspaceBundle(body);
  if (!bundle) {
    return apiJsonError(c, 400, 'No model credentials for this hypothesis');
  }
  const { ctx, prompts, evaluationContext, provenance } = bundle;
  const evalActive = body.domainHypothesis?.revisionEnabled === true;

  return c.json({
    prompts,
    evaluationContext: evalActive ? (evaluationContext ?? null) : null,
    provenance,
    generationContext: {
      modelCredentials: ctx.modelCredentials.map((cred) => ({
        providerId: cred.providerId,
        modelId: cred.modelId,
        thinkingLevel: cred.thinkingLevel,
      })),
    },
  });
});

hypothesis.post('/generate', async (c) => {
  const parsed = await parseRequestJson(c, HypothesisGenerateRequestSchema, {
    devWarnLabel: '[hypothesis] POST /generate',
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const bundle = await buildHypothesisWorkspaceBundle(body);
  if (!bundle) {
    return apiJsonError(c, 400, 'No model credentials for this hypothesis');
  }
  const { ctx, prompts, evaluationContext } = bundle;
  if (prompts.length === 0) {
    return apiJsonError(c, 400, 'No prompts to generate');
  }
  const prompt = prompts[0]!;
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

    const baseCorrelation =
      body.correlationId?.trim() || crypto.randomUUID();

    if (env.isDev) {
      console.debug('[hypothesis/generate] request', {
        correlationId: baseCorrelation,
        lanes: modelCredentials.length,
        promptChars: prompt.prompt.length,
        evalContext: effectiveEvaluationContext === null ? 'build_only' : 'eval',
      });
    }

    const base = {
      prompt: prompt.prompt,
      supportsVision: body.supportsVision,
      evaluatorProviderId: evaluatorClamp.evaluatorProviderId,
      evaluatorModelId: evaluatorClamp.evaluatorModelId,
      agenticMaxRevisionRounds: body.agenticMaxRevisionRounds,
      agenticMinOverallScore: body.agenticMinOverallScore,
      rubricWeights: body.rubricWeights,
    };

    const runLane = async (
      laneIndex: number,
      cred: { providerId: string; modelId: string; thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' },
    ) => {
      const streamBody = GenerateStreamBodySchema.parse({
        ...base,
        thinkingLevel: cred.thinkingLevel,
        evaluationContext: effectiveEvaluationContext,
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
        await stream.writeSSE({ data: '{}', event: SSE_EVENT_NAMES.done, id: allocId() });
      });
    } catch (err) {
      await gate.enqueue(async () => {
        await stream.writeSSE({
          data: JSON.stringify({ error: normalizeError(err) }),
          event: SSE_EVENT_NAMES.error,
          id: allocId(),
        });
        await stream.writeSSE({ data: '{}', event: SSE_EVENT_NAMES.done, id: allocId() });
      });
    }
  });
});

export default hypothesis;
