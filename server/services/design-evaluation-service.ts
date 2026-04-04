/**
 * Parallel (or sequential) evaluator workers + deterministic aggregate merge.
 * Uses GenerationProvider generateChat — not PI — so harness stays lightweight.
 */
import { z } from 'zod';
import { bundleVirtualFS } from '../../src/lib/bundle-virtual-fs.ts';
import {
  EVALUATOR_RUBRIC_IDS,
  type AggregatedEvaluationReport,
  type AggregatedHardFail,
  type EvaluationContextPayload,
  type EvalFinding,
  type EvaluatorRubricId,
  type EvaluatorWorkerReport,
} from '../../src/types/evaluation.ts';
import { evaluatorRubricIdZodSchema } from '../../src/lib/evaluator-rubric-zod.ts';
import type { PromptKey } from '../lib/prompts/defaults.ts';
import { env } from '../env.ts';
import { getProvider } from './providers/registry.ts';
import { loggedGenerateChat, type LlmLogContext } from '../lib/llm-call-logger.ts';
import { runBrowserQA } from './browser-qa-evaluator.ts';
import { mergePreflightWithPlaywright, runBrowserPlaywrightEval } from './browser-playwright-evaluator.ts';
import { parseJsonLenient } from '../lib/parse-json-lenient.ts';
import { createPreviewSession, deletePreviewSession } from './preview-session-store.ts';
import { encodeVirtualPathForUrl, resolvePreviewEntryPath } from '../../src/lib/preview-entry.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import {
  REVISION_GATE_CRITICAL_SCORE_MAX,
  REVISION_GATE_LOW_AVERAGE_THRESHOLD,
} from '../lib/evaluation-revision-gate.ts';
import { extractLlmJsonObjectSegment } from '../lib/extract-llm-json.ts';

const criterionSchema = z.object({
  score: z.number(),
  notes: z.string(),
});

export const evaluatorWorkerReportSchema = z.object({
  rubric: evaluatorRubricIdZodSchema,
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

function coerceToArray(
  v: unknown,
  isSingleItem: (o: Record<string, unknown>) => boolean,
): unknown[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (isSingleItem(o)) return [v];
    return Object.values(o);
  }
  return [];
}

function coerceFindingLikeArray(v: unknown): unknown[] {
  return coerceToArray(
    v,
    (o) =>
      typeof o.severity === 'string' &&
      typeof o.summary === 'string' &&
      typeof o.detail === 'string',
  );
}

function coerceHardFailLikeArray(v: unknown): unknown[] {
  return coerceToArray(v, (o) => typeof o.code === 'string' && typeof o.message === 'string');
}

/**
 * LLMs often nest `findings` / `hardFails` under `scores` or emit a single object instead of an array.
 * Hoist and coerce so Zod matches our EvaluatorWorkerReport contract.
 */
export function normalizeEvaluatorWorkerPayload(parsed: unknown): unknown {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return parsed;
  }
  const root = { ...(parsed as Record<string, unknown>) };
  const scoresRaw = root.scores;
  if (scoresRaw !== null && typeof scoresRaw === 'object' && !Array.isArray(scoresRaw)) {
    const scores = { ...(scoresRaw as Record<string, unknown>) };
    let mutated = false;
    if ('findings' in scores) {
      const nested = scores.findings;
      const hoisted = Array.isArray(nested) ? nested : coerceFindingLikeArray(nested);
      delete scores.findings;
      mutated = true;
      const top = coerceFindingLikeArray(root.findings);
      root.findings = [...top, ...hoisted];
    }
    if ('hardFails' in scores) {
      const nested = scores.hardFails;
      const hoisted = Array.isArray(nested) ? nested : coerceHardFailLikeArray(nested);
      delete scores.hardFails;
      mutated = true;
      const top = coerceHardFailLikeArray(root.hardFails);
      root.hardFails = [...top, ...hoisted];
    }
    if (mutated) root.scores = scores;
  }
  root.findings = coerceFindingLikeArray(root.findings);
  root.hardFails = coerceHardFailLikeArray(root.hardFails);
  return root;
}

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
export function parseModelJsonObject<T>(
  raw: string,
  schema: z.ZodType<T>,
  normalize?: (parsed: unknown) => unknown,
): T {
  const jsonStr = extractLlmJsonObjectSegment(raw, {
    requireObject: true,
    emptyMessage: 'Evaluator model returned no JSON object',
  });
  let parsed: unknown = parseJsonLenient(jsonStr);
  if (normalize) parsed = normalize(parsed);
  return schema.parse(parsed);
}

/** Fallback when a single evaluator worker throws or returns invalid JSON */
export function buildDegradedReport(rubric: EvaluatorRubricId, error: unknown): EvaluatorWorkerReport {
  const message = normalizeError(error);
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
  /** Live preview URL for this artifact (same virtual FS the UI serves). */
  previewPageUrl?: string,
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
    previewPageUrl
      ? `<preview_page_url>\n${previewPageUrl}\n</preview_page_url>`
      : '',
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
  logCtx: Pick<LlmLogContext, 'correlationId' | 'signal'>,
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
    { model: modelId, signal: logCtx.signal },
    {
      source: 'evaluator',
      phase: `Rubric: ${rubric}`,
      ...(logCtx.correlationId ? { correlationId: `${logCtx.correlationId}:eval:${rubric}` } : {}),
    },
  );
  return parseModelJsonObject(response.raw, evaluatorWorkerReportSchema, normalizeEvaluatorWorkerPayload);
}

async function runEvaluatorWorker(
  rubric: EvaluatorRubricId,
  systemPrompt: string,
  userContent: string,
  providerId: string,
  modelId: string,
  logCtx: Pick<LlmLogContext, 'correlationId' | 'signal'>,
): Promise<EvaluatorWorkerReport> {
  try {
    const report = await runOneEvaluator(
      rubric,
      systemPrompt,
      userContent,
      providerId,
      modelId,
      logCtx,
    );
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
  /** Propagates to LLM log rows for this evaluation round */
  correlationId?: string;
  signal?: AbortSignal;
  /** Called once per rubric worker as it finishes (parallel or sequential). */
  onWorkerDone?: (rubric: EvaluatorRubricId, report: EvaluatorWorkerReport) => void;
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

  const previewSessionId = createPreviewSession(input.files);
  const previewPageUrl = `${env.previewPublicBaseUrl}/api/preview/sessions/${previewSessionId}/${encodeVirtualPathForUrl(resolvePreviewEntryPath(input.files))}`;

  try {
    const userContent = buildEvaluatorUserContent(
      input.files,
      input.compiledPrompt,
      input.context,
      previewPageUrl,
    );

    const [sysDesign, sysStrategy, sysImpl] = await Promise.all([
      input.getPromptBody('evalDesignSystem'),
      input.getPromptBody('evalStrategySystem'),
      input.getPromptBody('evalImplementationSystem'),
    ]);

    const evalLogCtx: Pick<LlmLogContext, 'correlationId' | 'signal'> = {
      correlationId: input.correlationId,
      signal: input.signal,
    };

    const runDesign = () =>
      runEvaluatorWorker('design', sysDesign, userContent, evalProviderId, evalModelId, evalLogCtx);
    const runStrategy = () =>
      runEvaluatorWorker('strategy', sysStrategy, userContent, evalProviderId, evalModelId, evalLogCtx);
    const runImpl = () =>
      runEvaluatorWorker(
        'implementation',
        sysImpl,
        userContent,
        evalProviderId,
        evalModelId,
        evalLogCtx,
      );
    const runBrowser = async () => {
      try {
        const preflight = runBrowserQA({ files: input.files });
        if (!env.BROWSER_PLAYWRIGHT_EVAL) {
          return preflight;
        }
        const pw = await runBrowserPlaywrightEval({ files: input.files, previewPageUrl });
        return mergePreflightWithPlaywright(preflight, pw);
      } catch (err) {
        return buildDegradedReport('browser', err);
      }
    };

    const rubricJobs: { rubric: EvaluatorRubricId; run: () => Promise<EvaluatorWorkerReport> }[] = [
      { rubric: 'design', run: runDesign },
      { rubric: 'strategy', run: runStrategy },
      { rubric: 'implementation', run: runImpl },
      { rubric: 'browser', run: runBrowser },
    ];

    const emitDone = (rubric: EvaluatorRubricId, report: EvaluatorWorkerReport) => {
      input.onWorkerDone?.(rubric, report);
      return report;
    };

    const runWorker = (job: (typeof rubricJobs)[number]) =>
      job
        .run()
        .then((report) => emitDone(job.rubric, report), (reason) =>
          emitDone(job.rubric, buildDegradedReport(job.rubric, reason)),
        );

    if (input.parallel) {
      const [design, strategy, implementation, browser] = await Promise.all(rubricJobs.map(runWorker));
      return { design, strategy, implementation, browser };
    }

    const [design, strategy, implementation, browser] = [
      await runWorker(rubricJobs[0]!),
      await runWorker(rubricJobs[1]!),
      await runWorker(rubricJobs[2]!),
      await runWorker(rubricJobs[3]!),
    ];
    return { design, strategy, implementation, browser };
  } finally {
    deletePreviewSession(previewSessionId);
  }
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
  for (const rubric of EVALUATOR_RUBRIC_IDS) {
    for (const [criterion, { score }] of Object.entries(reports[rubric].scores)) {
      const key = `${rubric}_${criterion}`;
      normalizedScores[key] = score;
    }
  }

  const scoreValues = Object.values(normalizedScores);
  const overallScore =
    scoreValues.length > 0 ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : 0;

  const hardFails: AggregatedHardFail[] = [];
  for (const rubric of EVALUATOR_RUBRIC_IDS) {
    for (const hf of reports[rubric].hardFails) {
      hardFails.push({ ...hf, source: rubric });
    }
  }

  type FindingWithSource = EvalFinding & { source: EvaluatorRubricId };
  const allFindings: FindingWithSource[] = [];
  for (const rubric of EVALUATOR_RUBRIC_IDS) {
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

interface IsEvalSatisfiedOptions {
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
  const anyCritical = scores.some((s) => s <= REVISION_GATE_CRITICAL_SCORE_MAX);
  const hasHardFails = report.hardFails.length > 0;
  const lowAverage = avg < REVISION_GATE_LOW_AVERAGE_THRESHOLD;
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
