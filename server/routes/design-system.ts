import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { runTaskAgentSseBody } from '../lib/sse-task-route.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import { executeTaskAgentStream } from '../services/task-agent-execution.ts';
import { resolveThinkingConfig } from '../../src/lib/thinking-defaults.ts';
import { ThinkingOverrideSchema } from '../lib/hypothesis-schemas.ts';
import { env } from '../env.ts';
import { lintDesignMdDocument } from '../lib/design-md-lint.ts';

const designSystem = new Hono();

const ExtractRequestSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  sourceHash: z.string().optional(),
  images: z.array(z.object({
    dataUrl: z.string(),
    mimeType: z.string().optional(),
    name: z.string().optional(),
    filename: z.string().optional(),
    description: z.string().optional(),
  }).passthrough()).optional(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  thinking: ThinkingOverrideSchema.optional(),
}).refine((body) => Boolean(body.content?.trim()) || Boolean(body.images?.length), {
  message: 'Provide design-system text, reference images, or both.',
});

designSystem.post('/extract', async (c) => {
  const parsed = await parseRequestJson(c, ExtractRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };

  const imageDescriptions = (body.images ?? [])
    .map((img, i) => {
      const name = img.name ?? img.filename ?? `screenshot-${i + 1}`;
      return `Image ${i + 1}: ${name}${img.description ? ` — ${img.description}` : ''}`;
    })
    .join('\n');

  const agentUserPrompt = `<task>
Create a Google DESIGN.md document from the provided design-system source material.

Analyze the written source material and any UI screenshots. Convert them into a standards-compliant DESIGN.md document using the exact Google DESIGN.md contract:
- YAML front matter may contain only: version, name, description, colors, typography, rounded, spacing, components.
- Include every official YAML token group: colors, typography, rounded, spacing, and components.
- Use \`rounded\`, not \`radius\`; do not add non-spec YAML groups such as motion, elevation, shadows, or accessibility.
- Include every official Markdown section in this order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts.
- If the source is incomplete, infer a complete, coherent design system by best estimation. Inferred values must still be valid DESIGN.md YAML values; document uncertainty in the relevant Markdown section, not in invalid token values.
Write the complete Markdown document to \`DESIGN.md\` in the workspace root.

Use the \`use_skill\` tool to load relevant skills before beginning extraction.
</task>

<design_system_title>
${body.title ?? 'Design System'}
</design_system_title>

<source_hash>
${body.sourceHash ?? '(not provided)'}
</source_hash>

<written_source>
${body.content?.trim() ?? ''}
</written_source>

<screenshots>
${imageDescriptions}
</screenshots>

Generate DESIGN.md from this design-system source.`;

  return streamSSE(c, async (stream) => {
    const abortSignal = c.req.raw.signal;
    const correlationId = crypto.randomUUID();
    if (env.isDev) {
      console.debug('[design-system] request', {
        correlationId,
        providerId: body.providerId,
        modelId: body.modelId,
        imageCount: body.images?.length ?? 0,
        hasText: Boolean(body.content?.trim()),
      });
    }
    await runTaskAgentSseBody(stream, async ({ write, allocId, gate }) => {
      const thinking = resolveThinkingConfig('design-system', body.modelId, body.thinking);
      const taskResult = await executeTaskAgentStream(
        stream,
        {
          userPrompt: agentUserPrompt,
          providerId: body.providerId,
          modelId: body.modelId,
          sessionType: 'design-system',
          thinking,
          signal: abortSignal,
          correlationId,
          resultFile: 'DESIGN.md',
          initialProgressMessage: 'Generating DESIGN.md…',
        },
        { allocId, writeGate: gate },
      );

      if (taskResult) {
        const result = taskResult.result.trim();
        const lint = await lintDesignMdDocument(result);
        if (lint.errors > 0) {
          throw new Error(
            `Generated DESIGN.md failed lint with ${lint.errors} error${lint.errors === 1 ? '' : 's'}.`,
          );
        }
        await write(SSE_EVENT_NAMES.task_result, { result, lint });
      }
    });
  });
});

export default designSystem;
