import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { runTaskAgentSseBody } from '../lib/sse-task-route.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import { executeTaskAgentStream } from '../services/task-agent-execution.ts';

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

  const imageDescriptions = body.images
    .map((img, i) => `Image ${i + 1}: ${img.name ?? `screenshot-${i + 1}`}`)
    .join('\n');

  const agentUserPrompt = `<task>
Extract the design system from the provided screenshots.

Analyze the UI screenshots and extract every repeatable visual decision into a structured JSON design system.
Write the complete JSON result to \`result.json\` in the workspace root.

Use the \`use_skill\` tool to load relevant skills before beginning extraction.
</task>

<screenshots>
${imageDescriptions}
</screenshots>

Extract the design system from these screenshots.`;

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    const correlationId = crypto.randomUUID();
    await runTaskAgentSseBody(stream, async ({ write, allocId, gate }) => {
      const taskResult = await executeTaskAgentStream(
        stream,
        {
          userPrompt: agentUserPrompt,
          providerId: body.providerId,
          modelId: body.modelId,
          sessionType: 'design-system',
          signal: abortSignal,
          correlationId,
          resultFile: 'result.json',
          initialProgressMessage: 'Extracting design system from screenshots…',
        },
        { allocId, writeGate: gate },
      );

      if (taskResult) {
        await write(SSE_EVENT_NAMES.task_result, { result: taskResult.result });
      }
    });
  });
});

export default designSystem;
