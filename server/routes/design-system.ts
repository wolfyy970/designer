import { Hono } from 'hono';
import { z } from 'zod';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import { ThinkingOverrideSchema } from '../lib/hypothesis-schemas.ts';
import { lintDesignMdDocument } from '../lib/design-md-lint.ts';
import { runTaskAgentRoute } from '../lib/task-agent-route-runner.ts';

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

Use the \`use_skill\` tool to load the relevant DESIGN.md extraction skill before beginning. Treat that skill as the authoritative contract for the Google/Stitch DESIGN.md schema, section order, inference policy, and lint-friendly output.

Analyze the written source material and any UI screenshots, then write the complete Markdown document to \`DESIGN.md\` in the workspace root.
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

  return runTaskAgentRoute(c, {
    routeLabel: 'design-system',
    body,
    userPrompt: agentUserPrompt,
    sessionType: 'design-system',
    thinkingTask: 'design-system',
    resultFile: 'DESIGN.md',
    initialProgressMessage: 'Generating DESIGN.md…',
    debugPayload: (b) => ({
      imageCount: b.images?.length ?? 0,
      hasText: Boolean(b.content?.trim()),
    }),
    onTaskResult: async (taskResult, { write }) => {
      const result = taskResult.result.trim();
      const lint = await lintDesignMdDocument(result);
      if (lint.errors > 0) {
        throw new Error(
          `Generated DESIGN.md failed lint with ${lint.errors} error${lint.errors === 1 ? '' : 's'}.`,
        );
      }
      await write(SSE_EVENT_NAMES.task_result, { result, lint });
    },
  });
});

export default designSystem;
