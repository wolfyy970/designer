import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { getProvider } from '../services/providers/registry.ts';
import { getPromptBody } from '../db/prompts.ts';
import { extractCode } from '../lib/extract-code.ts';
import { logLlmCall } from '../log-store.ts';
import { normalizeError } from '../lib/error-utils.ts';
import { runAgenticWithEvaluation, type AgenticOrchestratorEvent } from '../services/agentic-orchestrator.ts';
import type { ChatMessage } from '../../src/types/provider.ts';
const generate = new Hono();

const EvaluationContextSchema = z
  .object({
    strategyName: z.string().optional(),
    hypothesis: z.string().optional(),
    rationale: z.string().optional(),
    measurements: z.string().optional(),
    dimensionValues: z.record(z.string(), z.string()).optional(),
    objectivesMetrics: z.string().optional(),
    designConstraints: z.string().optional(),
    designSystemSnapshot: z.string().optional(),
  })
  .optional();

const GenerateRequestSchema = z.object({
  prompt: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  supportsVision: z.boolean().optional(),
  mode: z.enum(['single', 'agentic']).optional().default('single'),
  thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high']).optional(),
  evaluationContext: EvaluationContextSchema,
  evaluatorProviderId: z.string().optional(),
  evaluatorModelId: z.string().optional(),
});

generate.post('/', async (c) => {
  const raw = await c.req.json();
  const parsed = GenerateRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }
  const body = parsed.data;

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    let id = 0;

    try {
      if (body.mode === 'agentic') {
        const writeAgentic = async (event: AgenticOrchestratorEvent) => {
          if (abortSignal.aborted) return;
          if (event.type === 'phase') {
            await stream.writeSSE({
              data: JSON.stringify({ phase: event.phase }),
              event: 'phase',
              id: String(id++),
            });
            return;
          }
          if (event.type === 'evaluation_progress') {
            await stream.writeSSE({
              data: JSON.stringify({
                round: event.round,
                phase: event.phase,
                message: event.message,
              }),
              event: 'evaluation_progress',
              id: String(id++),
            });
            return;
          }
          if (event.type === 'evaluation_report') {
            await stream.writeSSE({
              data: JSON.stringify({ round: event.round, snapshot: event.snapshot }),
              event: 'evaluation_report',
              id: String(id++),
            });
            return;
          }
          if (event.type === 'revision_round') {
            await stream.writeSSE({
              data: JSON.stringify({ round: event.round, brief: event.brief }),
              event: 'revision_round',
              id: String(id++),
            });
            return;
          }
          if (event.type === 'activity') {
            await stream.writeSSE({
              data: JSON.stringify({ entry: event.payload }),
              event: 'activity',
              id: String(id++),
            });
          } else if (event.type === 'code') {
            await stream.writeSSE({
              data: JSON.stringify({ code: event.payload }),
              event: 'code',
              id: String(id++),
            });
          } else if (event.type === 'error') {
            await stream.writeSSE({
              data: JSON.stringify({ error: event.payload }),
              event: 'error',
              id: String(id++),
            });
          } else if (event.type === 'file') {
            await stream.writeSSE({
              data: JSON.stringify({ path: event.path, content: event.content }),
              event: 'file',
              id: String(id++),
            });
          } else if (event.type === 'plan') {
            await stream.writeSSE({
              data: JSON.stringify({ files: event.files }),
              event: 'plan',
              id: String(id++),
            });
          } else if (event.type === 'todos') {
            await stream.writeSSE({
              data: JSON.stringify({ todos: event.todos }),
              event: 'todos',
              id: String(id++),
            });
          } else {
            await stream.writeSSE({
              data: JSON.stringify({ status: event.payload }),
              event: 'progress',
              id: String(id++),
            });
          }
        };

        const agenticResult = await runAgenticWithEvaluation({
          build: {
            systemPrompt: await getPromptBody('genSystemHtmlAgentic'),
            userPrompt: body.prompt,
            providerId: body.providerId,
            modelId: body.modelId,
            thinkingLevel: body.thinkingLevel,
            signal: abortSignal,
          },
          compiledPrompt: body.prompt,
          evaluationContext: body.evaluationContext,
          evaluatorProviderId: body.evaluatorProviderId,
          evaluatorModelId: body.evaluatorModelId,
          getPromptBody,
          onStream: writeAgentic,
        });
        if (agenticResult?.checkpoint) {
          await stream.writeSSE({
            data: JSON.stringify({ checkpoint: agenticResult.checkpoint }),
            event: 'checkpoint',
            id: String(id++),
          });
        }
        await stream.writeSSE({ data: '{}', event: 'done', id: String(id++) });
      } else {
        const provider = getProvider(body.providerId);
        if (!provider) {
          await stream.writeSSE({ data: JSON.stringify({ error: `Unknown provider: ${body.providerId}` }), event: 'error', id: String(id++) });
          return;
        }

        const systemPrompt = await getPromptBody('genSystemHtml');

        await stream.writeSSE({ data: JSON.stringify({ status: 'Generating design...' }), event: 'progress', id: String(id++) });

        const messages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: body.prompt },
        ];

        const t0 = performance.now();
        const response = await provider.generateChat(messages, {
          model: body.modelId,
          supportsVision: body.supportsVision,
        });
        const durationMs = Math.round(performance.now() - t0);

        if (abortSignal.aborted) return;

        logLlmCall({
          source: 'builder',
          model: body.modelId,
          provider: body.providerId,
          systemPrompt,
          userPrompt: body.prompt,
          response: response.raw,
          durationMs,
        });

        const code = extractCode(response.raw);

        await stream.writeSSE({ data: JSON.stringify({ code }), event: 'code', id: String(id++) });
        await stream.writeSSE({ data: '{}', event: 'done', id: String(id++) });
      }
    } catch (err) {
      await stream.writeSSE({ data: JSON.stringify({ error: normalizeError(err) }), event: 'error', id: String(id++) });
    }
  });
});

export default generate;
