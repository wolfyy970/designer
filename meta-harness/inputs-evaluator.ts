/**
 * LLM rubric for meta-harness --mode=inputs: score auto-generated spec input content.
 *
 * Five dimensions aligned with the North Star — upstream input quality directly
 * determines downstream hypothesis and design quality.
 */
import { z } from 'zod';
import { fetchOpenRouterChat } from './openrouter-client.ts';
import { INPUTS_RUBRIC_ERROR_SNIPPET_MAX } from './constants.ts';

export const INPUTS_RUBRIC_KEYS = [
  'grounding',
  'completeness',
  'actionability',
  'conciseness',
  'briefAlignment',
] as const;

const inputsRubricResponseSchema = z.object({
  grounding: z.number().min(1).max(5),
  completeness: z.number().min(1).max(5),
  actionability: z.number().min(1).max(5),
  conciseness: z.number().min(1).max(5),
  briefAlignment: z.number().min(1).max(5),
});

export type InputsRubricScores = z.infer<typeof inputsRubricResponseSchema>;

function extractJsonObject(text: string): string | null {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const body = fence ? fence[1]!.trim() : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}

const SYSTEM_INSTRUCTIONS = `You are an expert design-strategy researcher. Score ONE auto-generated spec input against the user's design brief.

The input was auto-generated from a design brief to serve as upstream context for hypothesis generation. A brilliant designer's research, objectives, or constraints content is the foundation that makes or breaks everything downstream — hypothesis quality, design execution, and evaluation.

Return ONLY valid JSON (no markdown) with these keys, each an integer 1-5:
- grounding: anchored in the brief's actual problem, audience, and constraints? No fabrication or unsupported claims?
- completeness: covers the expected territory for this input type? No critical gaps?
- actionability: useful for the Incubator to generate meaningfully different hypotheses? Concrete enough to design against?
- conciseness: no padding, filler, or generic boilerplate? Every sentence earns its place?
- briefAlignment: directly addresses what the brief says, not tangential topics?

Use the full scale; avoid giving 4 on everything. A 5 means a senior designer would not rewrite it.`;

export type ScoreInputsOptions = {
  apiKey: string;
  model: string;
  /** Spec facet id (e.g. research-context). */
  inputFacetId: string;
  designBrief: string;
  generatedContent: string;
  signal?: AbortSignal;
  openRouterChatTimeoutMs?: number;
};

export type ScoreInputsResult = {
  mean: number;
  scores: InputsRubricScores;
};

export async function scoreInputsWithRubric(options: ScoreInputsOptions): Promise<ScoreInputsResult> {
  const user = [
    '## Design brief',
    options.designBrief,
    '',
    `## Input facet: ${options.inputFacetId}`,
    '',
    '## Generated content to score',
    options.generatedContent,
    '',
    'Reply with ONLY a JSON object containing the five numeric keys listed in the system message.',
  ].join('\n');

  const json = await fetchOpenRouterChat({
    apiKey: options.apiKey,
    requestBody: {
      model: options.model,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTIONS },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
    },
    signal: options.signal,
    timeoutMs:
      options.signal == null &&
      options.openRouterChatTimeoutMs != null &&
      options.openRouterChatTimeoutMs > 0
        ? options.openRouterChatTimeoutMs
        : undefined,
  });
  const content = json.choices[0]!.message.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter: empty content for inputs rubric');
  }

  const rawJson = extractJsonObject(content);
  if (!rawJson) {
    throw new Error(
      `Could not parse JSON from inputs rubric response: ${content.slice(0, INPUTS_RUBRIC_ERROR_SNIPPET_MAX)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    throw new Error(
      `Invalid JSON in inputs rubric response: ${rawJson.slice(0, INPUTS_RUBRIC_ERROR_SNIPPET_MAX)}`,
    );
  }
  const scores = inputsRubricResponseSchema.parse(parsed);
  const mean =
    INPUTS_RUBRIC_KEYS.reduce((acc, k) => acc + scores[k], 0) / INPUTS_RUBRIC_KEYS.length;

  return { mean, scores };
}
