import { Hono } from 'hono';
import { z } from 'zod';
import type { ReferenceImage } from '../../src/types/spec.ts';
import { getPromptBody } from '../db/prompts.ts';
import { apiJsonError } from '../lib/api-json-error.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { loggedCallLLM } from '../lib/llm-call-logger.ts';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';

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
  const parsed = await parseRequestJson(c, ExtractRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };

  const [systemPrompt, userPrompt] = await Promise.all([
    getPromptBody('designSystemExtract'),
    getPromptBody('designSystemExtractUser'),
  ]);

  try {
    const response = await loggedCallLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      body.modelId,
      body.providerId,
      { images: body.images as ReferenceImage[] },
      { source: 'designSystem', phase: 'Extract from screenshots' },
    );
    return c.json({ result: response });
  } catch (err) {
    return apiJsonError(c, 500, normalizeError(err));
  }
});

export default designSystem;
