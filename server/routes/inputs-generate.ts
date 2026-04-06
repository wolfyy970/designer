import { Hono } from 'hono';
import { z } from 'zod';
import { createResolvePromptBody, sanitizePromptOverrides } from '../lib/prompt-overrides.ts';
import { apiJsonError } from '../lib/api-json-error.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { loggedCallLLM } from '../lib/llm-call-logger.ts';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import {
  buildInputsGenerateUserMessage,
  promptKeyForInputsGenerate,
} from '../../src/lib/prompts/inputs-generate.ts';

const InputsGenerateTargetSchema = z.enum([
  'research-context',
  'objectives-metrics',
  'design-constraints',
]);

const InputsGenerateRequestSchema = z.object({
  inputId: InputsGenerateTargetSchema,
  designBrief: z.string().min(1),
  existingDesign: z.string().optional(),
  researchContext: z.string().optional(),
  objectivesMetrics: z.string().optional(),
  designConstraints: z.string().optional(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  promptOverrides: z.record(z.string(), z.string()).optional(),
});

const inputsGenerate = new Hono();

inputsGenerate.post('/generate', async (c) => {
  const parsed = await parseRequestJson(c, InputsGenerateRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };

  const resolvePrompt = createResolvePromptBody(sanitizePromptOverrides(body.promptOverrides));
  const promptKey = promptKeyForInputsGenerate(body.inputId);
  const systemPrompt = await resolvePrompt(promptKey);
  const userPrompt = buildInputsGenerateUserMessage({
    targetInput: body.inputId,
    designBrief: body.designBrief,
    existingDesign: body.existingDesign,
    researchContext: body.researchContext,
    objectivesMetrics: body.objectivesMetrics,
    designConstraints: body.designConstraints,
  });

  try {
    const raw = await loggedCallLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      body.modelId,
      body.providerId,
      {},
      {
        source: 'other',
        phase: `Inputs auto-generate (${body.inputId})`,
      },
    );
    const result = raw.trim();
    return c.json({ result });
  } catch (err) {
    return apiJsonError(c, 500, normalizeError(err));
  }
});

export default inputsGenerate;
