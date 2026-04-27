import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { runTaskAgentSseBody } from '../lib/sse-task-route.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import { DesignSpecSchema } from '../../src/types/spec.ts';
import { buildInternalContextUserMessage } from '../../src/lib/internal-context.ts';
import { executeTaskAgentStream } from '../services/task-agent-execution.ts';
import { resolveThinkingConfig } from '../../src/lib/thinking-defaults.ts';
import { ThinkingOverrideSchema } from '../lib/hypothesis-schemas.ts';
import { env } from '../env.ts';

const InternalContextGenerateRequestSchema = z.object({
  spec: DesignSpecSchema,
  sourceHash: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  thinking: ThinkingOverrideSchema.optional(),
});

const internalContext = new Hono();

internalContext.post('/generate', async (c) => {
  const parsed = await parseRequestJson(c, InternalContextGenerateRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };

  const contextMessage = buildInternalContextUserMessage(body.spec);
  const agentUserPrompt = `<task>
Create an internal design context document from the specification inputs below.

Write the final Markdown document to \`result.md\` in the workspace root.
The output should be ready for a designer to inspect and for the Incubator to use as context — no JSON wrapping, no markdown code fences around the whole document, no meta commentary before or after the document.

Use the \`use_skill\` tool to load relevant skills before generating.
</task>

<source_hash>${body.sourceHash}</source_hash>

${contextMessage}`;

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    const correlationId = crypto.randomUUID();
    if (env.isDev) {
      console.debug('[internal-context] request', {
        correlationId,
        providerId: body.providerId,
        modelId: body.modelId,
        sourceHash: body.sourceHash,
      });
    }
    await runTaskAgentSseBody(stream, async ({ write, allocId, gate }) => {
      const thinking = resolveThinkingConfig('internal-context', body.modelId, body.thinking);
      const taskResult = await executeTaskAgentStream(
        stream,
        {
          userPrompt: agentUserPrompt,
          providerId: body.providerId,
          modelId: body.modelId,
          sessionType: 'internal-context',
          thinking,
          signal: abortSignal,
          correlationId,
          resultFile: 'result.md',
          initialProgressMessage: 'Synthesizing internal context…',
        },
        { allocId, writeGate: gate },
      );

      if (taskResult) {
        await write(SSE_EVENT_NAMES.task_result, { result: taskResult.result.trim() });
      }
    });
  });
});

export default internalContext;
