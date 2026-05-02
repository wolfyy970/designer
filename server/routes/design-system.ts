import { Hono } from 'hono';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import { lintDesignMdDocument } from '../lib/design-md-lint.ts';
import { runTaskAgentRoute } from '../lib/task-agent-route-runner.ts';
import { getPromptBody } from '../lib/prompt-resolution.ts';
import { DesignSystemExtractRequestSchema } from '../../src/api/request-schemas.ts';

const designSystem = new Hono();

function escapePromptAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

designSystem.post('/extract', async (c) => {
  const parsed = await parseRequestJson(c, DesignSystemExtractRequestSchema);
  if (!parsed.ok) return parsed.response;
  const pinned = clampProviderModel(parsed.data.providerId, parsed.data.modelId);
  const body = { ...parsed.data, providerId: pinned.providerId, modelId: pinned.modelId };

  const imageDescriptions = (body.images ?? [])
    .map((img, i) => {
      const name = img.name ?? img.filename ?? `screenshot-${i + 1}`;
      return `Image ${i + 1}: ${name}${img.description ? ` — ${img.description}` : ''}`;
    })
    .join('\n');
  const markdownSources = (body.markdownSources ?? [])
    .filter((source) => source.content.trim())
    .map((source) =>
      `<markdown_source filename="${escapePromptAttribute(source.filename)}" sizeBytes="${source.sizeBytes}">
${source.content.trim()}
</markdown_source>`,
    )
    .join('\n\n');

  const extractionGuidance = await getPromptBody('design-system-extract-system');
  const agentUserPrompt = `<task>
Create a Google DESIGN.md document from the provided design-system source material.

Treat the guidance below as the authoritative contract for the Google/Stitch DESIGN.md schema, section order, inference policy, and lint-friendly output.

Analyze the written source material, uploaded Markdown sources, and any UI screenshots, then write the complete Markdown document to \`DESIGN.md\` in the workspace root.

Uploaded Markdown sources, including files already named \`DESIGN.md\`, are source evidence. Do not assume they are already canonical or lint-clean. Preserve their intent, repair schema/section/token issues where needed, normalize them into the current Google/Stitch DESIGN.md format, and produce one complete lint-friendly \`DESIGN.md\`.
</task>

<design_md_extraction_guidance>
${extractionGuidance}
</design_md_extraction_guidance>

<design_system_title>
${body.title ?? 'Design System'}
</design_system_title>

<source_hash>
${body.sourceHash ?? '(not provided)'}
</source_hash>

<written_source>
${body.content?.trim() ?? ''}
</written_source>

<markdown_sources>
${markdownSources}
</markdown_sources>

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
