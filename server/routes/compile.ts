import { Hono } from 'hono';
import { z } from 'zod';
import type { DesignSpec } from '../../src/types/spec.ts';
import type { CompilerPromptOptions } from '../lib/prompts/compiler-user.ts';
import { compileSpec } from '../services/compiler.ts';
import { getPromptBody } from '../db/prompts.ts';
import { normalizeError } from '../lib/error-utils.ts';
import { clampProviderModel } from '../lib/lockdown-model.ts';

const compile = new Hono();

const CompileRequestSchema = z.object({
  spec: z.object({ id: z.string() }).passthrough(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  referenceDesigns: z.array(z.object({
    name: z.string(),
    code: z.string(),
  })).optional(),
  supportsVision: z.boolean().optional(),
  promptOptions: z.object({
    count: z.number().int().positive().optional(),
    existingStrategies: z.array(z.unknown()).optional(),
  }).optional(),
});

compile.post('/', async (c) => {
  const raw = await c.req.json();
  const parsed = CompileRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);
  }
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };

  const [systemPrompt, userPromptTemplate] = await Promise.all([
    getPromptBody('compilerSystem'),
    getPromptBody('compilerUser'),
  ]);

  try {
    const result = await compileSpec(
      body.spec as DesignSpec,
      body.modelId,
      body.providerId,
      {
        systemPrompt,
        userPromptTemplate,
        referenceDesigns: body.referenceDesigns,
        supportsVision: body.supportsVision,
        promptOptions: body.promptOptions as CompilerPromptOptions | undefined,
      },
    );
    return c.json(result);
  } catch (err) {
    return c.json({ error: normalizeError(err) }, 500);
  }
});

export default compile;
