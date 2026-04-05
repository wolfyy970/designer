/**
 * LLM rubric for meta-harness --mode=compile: score generated hypotheses without building designs.
 */
import { z } from 'zod';
import type { DesignSpec } from '../src/types/spec.ts';
import type { HypothesisStrategy } from '../src/types/compiler.ts';

import { OPENROUTER_CHAT_URL } from './constants.ts';

const RUBRIC_KEYS = [
  'specificity',
  'testability',
  'briefAlignment',
  'creativeQuality',
  'measurementClarity',
  'dimensionCoherence',
] as const;

const rubricResponseSchema = z.object({
  specificity: z.number().min(1).max(5),
  testability: z.number().min(1).max(5),
  briefAlignment: z.number().min(1).max(5),
  creativeQuality: z.number().min(1).max(5),
  measurementClarity: z.number().min(1).max(5),
  dimensionCoherence: z.number().min(1).max(5),
});

type HypothesisRubricScores = z.infer<typeof rubricResponseSchema>;

const SECTION_ORDER = [
  'design-brief',
  'existing-design',
  'research-context',
  'objectives-metrics',
  'design-constraints',
] as const;

/** Flatten design spec into markdown for evaluator context. */
export function designSpecToEvalContext(spec: DesignSpec): string {
  const lines: string[] = [`# ${spec.title}`];
  for (const key of SECTION_ORDER) {
    const s = spec.sections[key];
    const c = s?.content?.trim() ?? '';
    if (c) lines.push(`\n## ${key.replace(/-/g, ' ')}\n${c}`);
  }
  return lines.join('\n');
}

function hypothesisBlock(h: HypothesisStrategy): string {
  const dims = Object.entries(h.dimensionValues ?? {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  return [
    `id: ${h.id}`,
    `name: ${h.name}`,
    `hypothesis: ${h.hypothesis}`,
    `rationale: ${h.rationale}`,
    `measurements: ${h.measurements}`,
    `dimensionValues:\n${dims || '(none)'}`,
  ].join('\n');
}

function extractJsonObject(text: string): string | null {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const body = fence ? fence[1]!.trim() : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}

const SYSTEM_INSTRUCTIONS = `You are an expert design-strategy reviewer. Score ONE hypothesis against the user's design spec.

Return ONLY valid JSON (no markdown) with these keys, each an integer 1-5:
- specificity: concrete enough to design against?
- testability: objectively verifiable?
- briefAlignment: addresses the core problem in the brief?
- creativeQuality: thoughtful, non-obvious direction?
- measurementClarity: measurements are actionable?
- dimensionCoherence: dimension values support the hypothesis?

Use the full scale; avoid giving 4 on everything.`;

type ScoreHypothesisOptions = {
  apiKey: string;
  model: string;
  specContext: string;
  hypothesis: HypothesisStrategy;
  signal?: AbortSignal;
};

type ScoreHypothesisResult = {
  mean: number;
  scores: HypothesisRubricScores;
};

/** Mean of the six rubric dimensions for one hypothesis. */
export async function scoreHypothesisWithRubric(options: ScoreHypothesisOptions): Promise<ScoreHypothesisResult> {
  const user = [
    '## Design spec',
    options.specContext,
    '',
    '## Hypothesis to score',
    hypothesisBlock(options.hypothesis),
    '',
    'Reply with ONLY a JSON object containing the six numeric keys listed in the system message.',
  ].join('\n');

  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTIONS },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenRouter hypothesis rubric ${res.status}: ${t.slice(0, 600)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenRouter: empty content for hypothesis rubric');
  }

  const rawJson = extractJsonObject(content);
  if (!rawJson) {
    throw new Error(`Could not parse JSON from rubric response: ${content.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    throw new Error(`Invalid JSON in rubric response: ${rawJson.slice(0, 200)}`);
  }
  const scores = rubricResponseSchema.parse(parsed);
  const mean =
    RUBRIC_KEYS.reduce((acc, k) => acc + scores[k], 0) / RUBRIC_KEYS.length;

  return { mean, scores };
}
