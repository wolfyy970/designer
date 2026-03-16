import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { getProvider } from '../services/providers/registry.ts';
import { resolvePrompt } from '../lib/prompts/defaults.ts';
import { extractCode } from '../lib/extract-code.ts';
import { logLlmCall } from '../log-store.ts';
import { normalizeError } from '../lib/error-utils.ts';
import { runDesignAgent } from '../services/pi-agent-service.ts';
import type { ChatMessage } from '../../src/types/provider.ts';

const generate = new Hono();

const GenerateRequestSchema = z.object({
  prompt: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  promptOverrides: z.object({
    genSystemHtml: z.string().optional(),
    genSystemHtmlAgentic: z.string().optional(),
    variant: z.string().optional(),
  }).optional(),
  supportsVision: z.boolean().optional(),
  mode: z.enum(['single', 'agentic']).optional().default('single'),
  thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high']).optional(),
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
        await runDesignAgent(
          {
            systemPrompt: resolvePrompt('genSystemHtmlAgentic', body.promptOverrides),
            userPrompt: body.prompt,
            providerId: body.providerId,
            modelId: body.modelId,
            thinkingLevel: body.thinkingLevel,
            signal: abortSignal,
          },
          async (event) => {
            if (abortSignal.aborted) return;
            if (event.type === 'activity') {
              await stream.writeSSE({ data: JSON.stringify({ entry: event.payload }), event: 'activity', id: String(id++) });
            } else if (event.type === 'code') {
              await stream.writeSSE({ data: JSON.stringify({ code: event.payload }), event: 'code', id: String(id++) });
            } else if (event.type === 'error') {
              await stream.writeSSE({ data: JSON.stringify({ error: event.payload }), event: 'error', id: String(id++) });
            } else if (event.type === 'file') {
              await stream.writeSSE({ data: JSON.stringify({ path: event.path, content: event.content }), event: 'file', id: String(id++) });
            } else if (event.type === 'plan') {
              await stream.writeSSE({ data: JSON.stringify({ files: event.files }), event: 'plan', id: String(id++) });
            } else {
              await stream.writeSSE({ data: JSON.stringify({ status: event.payload }), event: 'progress', id: String(id++) });
            }
          },
        );
        await stream.writeSSE({ data: '{}', event: 'done', id: String(id++) });
      } else {
        const provider = getProvider(body.providerId);
        if (!provider) {
          await stream.writeSSE({ data: JSON.stringify({ error: `Unknown provider: ${body.providerId}` }), event: 'error', id: String(id++) });
          return;
        }

        const systemPrompt = resolvePrompt('genSystemHtml', body.promptOverrides);

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
