import { Hono } from 'hono';
import { z } from 'zod';
import { DesignSpecSchema } from '../../src/types/spec.ts';
import type { CompilerPromptOptions } from '../../src/lib/prompts/compiler-user.ts';
import { VariantStrategySchema } from '../lib/hypothesis-schemas.ts';
import { compileSpec } from '../services/compiler.ts';
import { createResolvePromptBody, sanitizePromptOverrides } from '../lib/prompt-overrides.ts';
import { apiJsonError } from '../lib/api-json-error.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';

const compile = new Hono();

const CompilerPromptOptionsSchema = z.object({
  count: z.number().int().positive().optional(),
  existingStrategies: z.array(VariantStrategySchema).optional(),
}) satisfies z.ZodType<CompilerPromptOptions>;

const CompileRequestSchema = z.object({
  spec: DesignSpecSchema,
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  referenceDesigns: z.array(z.object({
    name: z.string(),
    code: z.string(),
  })).optional(),
  supportsVision: z.boolean().optional(),
  promptOptions: CompilerPromptOptionsSchema.optional(),
  promptOverrides: z.record(z.string(), z.string()).optional(),
});

compile.post('/', async (c) => {
  const parsed = await parseRequestJson(c, CompileRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };

  const resolvePrompt = createResolvePromptBody(sanitizePromptOverrides(body.promptOverrides));
  const [systemPrompt, userPromptTemplate] = await Promise.all([
    resolvePrompt('hypotheses-generator-system'),
    resolvePrompt('incubator-user-inputs'),
  ]);

  try {
    const result = await compileSpec(
      body.spec,
      body.modelId,
      body.providerId,
      {
        systemPrompt,
        userPromptTemplate,
        referenceDesigns: body.referenceDesigns,
        supportsVision: body.supportsVision,
        promptOptions: body.promptOptions,
      },
    );
    return c.json(result);
  } catch (err) {
    return apiJsonError(c, 500, normalizeError(err));
  }
});

export default compile;
