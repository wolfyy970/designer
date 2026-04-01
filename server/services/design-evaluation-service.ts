/**
 * Parallel (or sequential) evaluator workers + deterministic aggregate merge.
 * Uses GenerationProvider generateChat — not PI — so harness stays lightweight.
 */
import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';
import { bundleVirtualFS } from '../../src/lib/bundle-virtual-fs.ts';
import type {
  AggregatedEvaluationReport,
  AggregatedHardFail,
  EvaluationContextPayload,
  EvalFinding,
  EvaluatorRubricId,
  EvaluatorWorkerReport,
} from '../../src/types/evaluation.ts';
import type { PromptKey } from '../lib/prompts/defaults.ts';
import { env } from '../env.ts';
import { getProvider } from './providers/registry.ts';
import { loggedGenerateChat } from '../lib/llm-call-logger.ts';
import { runBrowserQA } from './browser-qa-evaluator.ts';
import { mergePreflightWithPlaywright, runBrowserPlaywrightEval } from './browser-playwright-evaluator.ts';

const criterionSchema = z.object({
  score: z.number(),
  notes: z.string(),
});

const workerReportSchema = z.object({
  rubric: z.enum(['design', 'strategy', 'implementation', 'browser']),
  scores: z.record(z.string(), criterionSchema),
  findings: z.array(
    z.object({
      severity: z.enum(['high', 'medium', 'low']),
      summary: z.string(),
      detail: z.string(),
    }),
  ),
  hardFails: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
    }),
  ),
});

const MAX_FILE_CHARS = 24_000;
const MAX_BUNDLE_CHARS = 32_000;

const SEVERITY_RANK: Record<EvalFinding['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function truncateBlock(label: string, content: string): string {
  if (content.length <= MAX_FILE_CHARS) return `<file path="${label}">\n${content}\n</file>`;
  return (
    `<file path="${label}">\n${content.slice(0, MAX_FILE_CHARS)}\n…[truncated]\n</file>`
  );
}

/** Strip markdown fences and parse first JSON object from model output */
export function parseModelJsonObject<T>(raw: string, schema: z.ZodType<T>): T {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('Evaluator model returned no JSON object');
  }
  const jsonStr = s.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    parsed = JSON.parse(jsonrepair(jsonStr));
  }
  return schema.parse(parsed);
}

/** Fallback when a single evaluator worker throws or returns invalid JSON */
export function buildDegradedReport(rubric: EvaluatorRubricId, error: unknown): EvaluatorWorkerReport {
  const message = error instanceof Error ? error.message : String(error);
  return {
    rubric,
    scores: {
      evaluator_unavailable: { score: 0, notes: `Worker failed: ${message}` },
    },
    findings: [
      {
        severity: 'high' as const,
        summary: 'Evaluator worker failed',
        detail: message,
      },
    ],
    hardFails: [
      {
        code: 'evaluator_worker_error',
        message: message.slice(0, 500),
      },
    ],
  };
}

export function buildEvaluatorUserContent(
  files: Record<string, string>,
  compiledPrompt: string,
  context?: EvaluationContextPayload,
): string {
  let bundled = '';
  try {
    bundled = bundleVirtualFS(files);
  } catch {
    bundled = '[bundle error]';
  }
  if (bundled.length > MAX_BUNDLE_CHARS) {
    bundled = bundled.slice(0, MAX_BUNDLE_CHARS) + '\n…[truncated]';
  }

  const fileBlocks = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => truncateBlock(path, content))
    .join('\n\n');

  const ctxParts: string[] = [];
  if (context?.strategyName) ctxParts.push(`<strategy_name>\n${context.strategyName}\n</strategy_name>`);
  if (context?.hypothesis) ctxParts.push(`<hypothesis_bet>\n${context.hypothesis}\n</hypothesis_bet>`);
  if (context?.rationale) ctxParts.push(`<rationale>\n${context.rationale}\n</rationale>`);
  if (context?.measurements) ctxParts.push(`<measurements_kpis>\n${context.measurements}\n</measurements_kpis>`);
  if (context?.dimensionValues && Object.keys(context.dimensionValues).length > 0) {
    ctxParts.push(
      `<dimension_values>\n${Object.entries(context.dimensionValues)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')}\n</dimension_values>`,
    );
  }
  if (context?.objectivesMetrics) {
    ctxParts.push(`<objectives_metrics>\n${context.objectivesMetrics}\n</objectives_metrics>`);
  }
  if (context?.designConstraints) {
    ctxParts.push(`<design_constraints>\n${context.designConstraints}\n</design_constraints>`);
  }
  if (context?.designSystemSnapshot) {
    ctxParts.push(`<design_system>\n${context.designSystemSnapshot}\n</design_system>`);
  }
  if (context?.outputFormat) {
    ctxParts.push(`<output_format>\n${context.outputFormat}\n</output_format>`);
  }

  return [
    '<instruction>Evaluate the artifact below. Return ONLY the JSON object specified in your system contract.</instruction>',
    '<compiled_generation_prompt>',
    compiledPrompt.length > MAX_FILE_CHARS
      ? `${compiledPrompt.slice(0, MAX_FILE_CHARS)}\n…[truncated]`
      : compiledPrompt,
    '</compiled_generation_prompt>',
    ctxParts.length > 0 ? `<structured_context>\n${ctxParts.join('\n\n')}\n</structured_context>` : '',
    '<source_files>',
    fileBlocks,
    '</source_files>',
    '<bundled_preview_html>',
    bundled,
    '</bundled_preview_html>',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function runOneEvaluator(
  rubric: EvaluatorRubricId,
  systemPrompt: string,
  userContent: string,
  providerId: string,
  modelId: string,
): Promise<EvaluatorWorkerReport> {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  const response = await loggedGenerateChat(
    provider,
    providerId,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    { model: modelId },
    { source: 'evaluator', phase: `Rubric: ${rubric}` },
  );
  return parseModelJsonObject(response.raw, workerReportSchema);
}

async function runEvaluatorWorker(
  rubric: EvaluatorRubricId,
  systemPrompt: string,
  userContent: string,
  providerId: string,
  modelId: string,
): Promise<EvaluatorWorkerReport> {
  try {
    const report = await runOneEvaluator(rubric, systemPrompt, userContent, providerId, modelId);
    if (report.rubric !== rubric) {
      return buildDegradedReport(
        rubric,
        new Error(`Rubric mismatch: expected ${rubric}, got ${report.rubric}`),
      );
    }
    return report;
  } catch (err) {
    return buildDegradedReport(rubric, err);
  }
}

export interface EvaluationRoundInput {
  files: Record<string, string>;
  compiledPrompt: string;
  context?: EvaluationContextPayload;
  providerId: string;
  modelId: string;
  /** Override provider/model for LLM-based evaluators (design, strategy, implementation) */
  evaluatorProviderId?: string;
  evaluatorModelId?: string;
  parallel: boolean;
  getPromptBody: (key: PromptKey) => Promise<string>;
}

export async function runEvaluationWorkers(
  input: EvaluationRoundInput,
): Promise<{
  design: EvaluatorWorkerReport;
  strategy: EvaluatorWorkerReport;
  implementation: EvaluatorWorkerReport;
  browser: EvaluatorWorkerReport;
}> {
  const evalProviderId = input.evaluatorProviderId ?? input.providerId;
  const evalModelId = input.evaluatorModelId ?? input.modelId;

  const userContent = buildEvaluatorUserContent(
    input.files,
    input.compiledPrompt,
    input.context,
  );

  const [sysDesign, sysStrategy, sysImpl] = await Promise.all([
    input.getPromptBody('evalDesignSystem'),
    input.getPromptBody('evalStrategySystem'),
    input.getPromptBody('evalImplementationSystem'),
  ]);

  const runDesign = () =>
    runEvaluatorWorker('design', sysDesign, userContent, evalProviderId, evalModelId);
  const runStrategy = () =>
    runEvaluatorWorker('strategy', sysStrategy, userContent, evalProviderId, evalModelId);
  const runImpl = () =>
    runEvaluatorWorker('implementation', sysImpl, userContent, evalProviderId, evalModelId);
  const runBrowser = async () => {
    try {
      const preflight = runBrowserQA({ files: input.files });
      if (!env.BROWSER_PLAYWRIGHT_EVAL) {
        return preflight;
      }
      const pw = await runBrowserPlaywrightEval({ files: input.files });
      return mergePreflightWithPlaywright(preflight, pw);
    } catch (err) {
      return buildDegradedReport('browser', err);
    }
  };

  if (input.parallel) {
    const settled = await Promise.allSettled([runDesign(), runStrategy(), runImpl(), runBrowser()]);
    const design =
      settled[0].status === 'fulfilled' ? settled[0].value : buildDegradedReport('design', settled[0].reason);
    const strategy =
      settled[1].status === 'fulfilled'
        ? settled[1].value
        : buildDegradedReport('strategy', settled[1].reason);
    const implementation =
      settled[2].status === 'fulfilled'
        ? settled[2].value
        : buildDegradedReport('implementation', settled[2].reason);
    const browser =
      settled[3].status === 'fulfilled'
        ? settled[3].value
        : buildDegradedReport('browser', settled[3].reason);
    return { design, strategy, implementation, browser };
  }

  const design = await runDesign();
  const strategy = await runStrategy();
  const implementation = await runImpl();
  const browser = await runBrowser();
  return { design, strategy, implementation, browser };
}

type WorkerBundle = {
  design: EvaluatorWorkerReport;
  strategy: EvaluatorWorkerReport;
  implementation: EvaluatorWorkerReport;
  browser: EvaluatorWorkerReport;
};

/**
 * Deterministic merge of four rubric reports into one revision brief (no LLM).
 */
export function aggregateEvaluationReports(reports: WorkerBundle): AggregatedEvaluationReport {
  const normalizedScores: Record<string, number> = {};
  const rubrics: EvaluatorRubricId[] = ['design', 'strategy', 'implementation', 'browser'];
  for (const rubric of rubrics) {
    for (const [criterion, { score }] of Object.entries(reports[rubric].scores)) {
      const key = `${rubric}_${criterion}`;
      normalizedScores[key] = score;
    }
  }

  const scoreValues = Object.values(normalizedScores);
  const overallScore =
    scoreValues.length > 0 ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : 0;

  const hardFails: AggregatedHardFail[] = [];
  for (const rubric of rubrics) {
    for (const hf of reports[rubric].hardFails) {
      hardFails.push({ ...hf, source: rubric });
    }
  }

  type FindingWithSource = EvalFinding & { source: EvaluatorRubricId };
  const allFindings: FindingWithSource[] = [];
  for (const rubric of rubrics) {
    for (const f of reports[rubric].findings) {
      allFindings.push({ ...f, source: rubric });
    }
  }
  allFindings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const seenSummaries = new Set<string>();
  const findingFixes: string[] = [];
  for (const f of allFindings) {
    if (seenSummaries.has(f.summary)) continue;
    seenSummaries.add(f.summary);
    findingFixes.push(`[${f.severity}] ${f.summary}: ${f.detail}`);
  }

  const hardFailFixes = hardFails.map((hf) => `[hard_fail:${hf.code}] ${hf.message}`);
  const prioritizedFixes = [...hardFailFixes, ...findingFixes];

  let revisionBrief = '## Prioritized remediation\n\n';
  if (prioritizedFixes.length === 0) {
    revisionBrief += '- No specific findings; review normalized scores for weak dimensions.\n';
  } else {
    for (const fix of prioritizedFixes) {
      revisionBrief += `- ${fix}\n`;
    }
  }

  return {
    overallScore,
    normalizedScores,
    hardFails,
    prioritizedFixes,
    shouldRevise: false,
    revisionBrief,
  };
}

export interface IsEvalSatisfiedOptions {
  /** If set, treat as satisfied when overallScore >= this and there are zero hard fails, even if shouldRevise is still true. */
  minOverallScore?: number;
}

/**
 * Whether to stop the revision loop for this aggregate.
 * Primary: !shouldRevise after enforceRevisionGate.
 * Optional: minOverallScore + no hard fails (OR semantics with primary).
 */
export function isEvalSatisfied(
  aggregate: AggregatedEvaluationReport,
  opts?: IsEvalSatisfiedOptions,
): boolean {
  if (!aggregate.shouldRevise) return true;
  const threshold = opts?.minOverallScore;
  if (threshold != null && Number.isFinite(threshold)) {
    if (aggregate.hardFails.length === 0 && aggregate.overallScore >= threshold) {
      return true;
    }
  }
  return false;
}

/** Apply rule-based shouldRevise if aggregate model omits or is lenient */
export function enforceRevisionGate(report: AggregatedEvaluationReport): AggregatedEvaluationReport {
  const scores = Object.values(report.normalizedScores);
  const avg =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : report.overallScore;
  const anyCritical = scores.some((s) => s <= 2);
  const hasHardFails = report.hardFails.length > 0;
  const lowAverage = avg < 3.5;
  const shouldRevise = report.shouldRevise || hasHardFails || anyCritical || lowAverage;
  return {
    ...report,
    shouldRevise,
    overallScore:
      Number.isFinite(report.overallScore) && report.overallScore > 0
        ? report.overallScore
        : Number.isFinite(avg)
          ? avg
          : 0,
  };
}
