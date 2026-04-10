/**
 * Parallel (or sequential) LLM evaluator workers + JSON normalization at the Zod boundary.
 */
import { z } from 'zod';
import {
  type EvaluationContextPayload,
  type EvaluatorRubricId,
  type EvaluatorWorkerReport,
} from '../../src/types/evaluation.ts';
import { evaluatorRubricIdZodSchema } from '../../src/lib/evaluator-rubric-zod.ts';
import { env } from '../env.ts';
import { getPromptBody } from '../lib/prompt-resolution.ts';
import { getProvider } from './providers/registry.ts';
import { loggedGenerateChat, type LlmLogContext } from '../lib/llm-call-logger.ts';
import { runBrowserQA } from './browser-qa-evaluator.ts';
import { mergePreflightWithPlaywright, runBrowserPlaywrightEval } from './browser-playwright-evaluator.ts';
import { parseJsonLenient } from '../lib/parse-json-lenient.ts';
import { createPreviewSession, deletePreviewSession } from './preview-session-store.ts';
import { encodeVirtualPathForUrl, resolvePreviewEntryPath } from '../../src/lib/preview-entry.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { extractLlmJsonObjectSegment } from '../lib/extract-llm-json.ts';
import { EVAL_DEGRADED_MSG_MAX } from '../lib/content-limits.ts';
import { buildEvaluatorUserContent } from './evaluator-prompt-assembly.ts';

const criterionSchema = z.object({
  score: z.number(),
  notes: z.string(),
});

const browserScreenshotArtifactSchema = z.object({
  mediaType: z.enum(['image/jpeg', 'image/png']),
  base64: z.string(),
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
  playwrightSkipped: z
    .object({
      reason: z.enum(['browser_unavailable', 'eval_error']),
      message: z.string(),
    })
    .optional(),
  artifacts: z
    .object({
      browserScreenshot: browserScreenshotArtifactSchema.optional(),
    })
    .optional(),
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

const EVAL_DEGRADED_LOG_MAX = 400;

/** Fallback when a single evaluator worker throws or returns invalid JSON */
export function buildDegradedReport(rubric: EvaluatorRubricId, error: unknown): EvaluatorWorkerReport {
  const message = normalizeError(error);
  const logBody =
    message.length > EVAL_DEGRADED_LOG_MAX ? `${message.slice(0, EVAL_DEGRADED_LOG_MAX)}…` : message;
  console.warn('[eval:worker-degraded]', { rubric, message: logBody });
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
        message: message.slice(0, EVAL_DEGRADED_MSG_MAX),
      },
    ],
  };
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
  const parsed = parseModelJsonObject(response.raw, evaluatorWorkerReportSchema, normalizeEvaluatorWorkerPayload);
  return { ...parsed, rawTrace: response.raw };
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
      getPromptBody('evaluator-design-quality'),
      getPromptBody('evaluator-strategy-fidelity'),
      getPromptBody('evaluator-implementation'),
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
