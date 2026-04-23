import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { runTaskAgentSseBody } from '../lib/sse-task-route.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import {
  buildInputsGenerateUserMessage,
} from '../../src/lib/prompts/inputs-generate.ts';
import { executeTaskAgentStream } from '../services/task-agent-execution.ts';
import { resolveThinkingConfig } from '../../src/lib/thinking-defaults.ts';
import { ThinkingOverrideSchema } from '../lib/hypothesis-schemas.ts';
import { env } from '../env.ts';

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
  thinking: ThinkingOverrideSchema.optional(),
});

const inputsGenerate = new Hono();

const INPUT_LABELS: Record<string, string> = {
  'research-context': 'Research & Context',
  'objectives-metrics': 'Objectives & Metrics',
  'design-constraints': 'Design Constraints',
};

inputsGenerate.post('/generate', async (c) => {
  const parsed = await parseRequestJson(c, InputsGenerateRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };

  const contextMessage = buildInputsGenerateUserMessage({
    targetInput: body.inputId,
    designBrief: body.designBrief,
    existingDesign: body.existingDesign,
    researchContext: body.researchContext,
    objectivesMetrics: body.objectivesMetrics,
    designConstraints: body.designConstraints,
  });

  const label = INPUT_LABELS[body.inputId] ?? body.inputId;
  const agentUserPrompt = `<task>
Generate the **${label}** section content for a design specification.

Write the result as plain text to \`result.txt\` in the workspace root.
The output should be ready to paste into a textarea — no JSON wrapping, no markdown code fences, no meta commentary.

Use the \`use_skill\` tool to load relevant skills before generating.
</task>

${contextMessage}`;

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    const correlationId = crypto.randomUUID();
    if (env.isDev) {
      console.debug('[inputs-generate] request', {
        correlationId,
        inputId: body.inputId,
        providerId: body.providerId,
        modelId: body.modelId,
        designBriefChars: body.designBrief.length,
      });
    }
    await runTaskAgentSseBody(stream, async ({ write, allocId, gate }) => {
      const thinking = resolveThinkingConfig('inputs', body.modelId, body.thinking);
      const taskResult = await executeTaskAgentStream(
        stream,
        {
          userPrompt: agentUserPrompt,
          providerId: body.providerId,
          modelId: body.modelId,
          sessionType: 'inputs-gen',
          thinking,
          signal: abortSignal,
          correlationId,
          resultFile: 'result.txt',
          initialProgressMessage: `Generating ${label}…`,
        },
        { allocId, writeGate: gate },
      );

      if (taskResult) {
        await write(SSE_EVENT_NAMES.task_result, { result: taskResult.result.trim() });
      }
    });
  });
});

export default inputsGenerate;
