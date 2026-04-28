import { Hono } from 'hono';
import { clampProviderModel } from '../lib/lockdown-model.ts';
import { parseRequestJson } from '../lib/parse-request.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import {
  buildInputsGenerateUserMessage,
} from '../../src/lib/prompts/inputs-generate.ts';
import { runTaskAgentRoute } from '../lib/task-agent-route-runner.ts';
import { InputsGenerateRequestSchema } from '../../src/api/request-schemas.ts';

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

  return runTaskAgentRoute(c, {
    routeLabel: 'inputs-generate',
    body,
    userPrompt: agentUserPrompt,
    sessionType: 'inputs-gen',
    thinkingTask: 'inputs',
    resultFile: 'result.txt',
    resultFileFallback: 'firstNonEmptyFile',
    initialProgressMessage: `Generating ${label}…`,
    debugPayload: (b) => ({
      inputId: b.inputId,
      designBriefChars: b.designBrief.length,
    }),
    onTaskResult: async (taskResult, { write }) => {
      await write(SSE_EVENT_NAMES.task_result, { result: taskResult.result.trim() });
    },
  });
});

export default inputsGenerate;
