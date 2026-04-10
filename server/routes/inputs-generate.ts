import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { createWriteGate } from '../lib/sse-write-gate.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import {
  buildInputsGenerateUserMessage,
} from '../../src/lib/prompts/inputs-generate.ts';
import { executeTaskAgentStream } from '../services/task-agent-execution.ts';

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
    let seq = 0;
    const allocId = () => String(seq++);
    const gate = createWriteGate();
    const correlationId = crypto.randomUUID();

    const write = async (event: string, data: Record<string, unknown>): Promise<void> => {
      const payload = JSON.stringify(data);
      await gate.enqueue(async () => {
        await stream.writeSSE({ data: payload, event, id: allocId() });
      });
    };

    try {
      const taskResult = await executeTaskAgentStream(
        stream,
        {
          userPrompt: agentUserPrompt,
          providerId: body.providerId,
          modelId: body.modelId,
          sessionType: 'inputs-gen',
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

      await write(SSE_EVENT_NAMES.phase, { phase: 'complete' });
      await write(SSE_EVENT_NAMES.done, {});
    } catch (err) {
      await write(SSE_EVENT_NAMES.error, { error: normalizeError(err) });
      await write(SSE_EVENT_NAMES.done, {});
    }
  });
});

export default inputsGenerate;
