import { Hono } from 'hono';
import { z } from 'zod';
import type { ReferenceImage } from '../../src/types/spec.ts';
import { callLLM } from '../services/compiler.ts';
import { getPromptBody } from '../db/prompts.ts';
import { normalizeError } from '../lib/error-utils.ts';

const designSystem = new Hono();

const ExtractRequestSchema = z.object({
  images: z.array(z.object({
    dataUrl: z.string(),
    mimeType: z.string().optional(),
    name: z.string().optional(),
  }).passthrough()),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
});

designSystem.post('/extract', async (c) => {
  const raw = await c.req.json();
  const parsed = ExtractRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }
  const body = parsed.data;

  const systemPrompt = await getPromptBody('designSystemExtract');

  try {
    const response = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Extract the design system from the provided screenshots.' },
      ],
      body.modelId,
      body.providerId,
      { images: body.images as ReferenceImage[] }
    );
    return c.json({ result: response });
  } catch (err) {
    return c.json({ error: normalizeError(err) }, 500);
  }
});

export default designSystem;
