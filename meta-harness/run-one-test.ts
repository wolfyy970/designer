/**
 * Evaluate a single meta-harness test case (compile / e2e / design paths).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SimplifiedMetaHarnessTestCase } from './test-case-hydrator.ts';
import {
  buildDesignSpecFromSimplified,
  hydrateMetaHarnessTestCaseFromParsed,
} from './test-case-hydrator.ts';
import { scoreHypothesisWithRubric, designSpecToEvalContext } from './hypothesis-evaluator.ts';
import { runHypothesisEvalFromMetaHarness } from './evaluator.ts';
import type { AggregatedEvaluationReport } from '../src/types/evaluation.ts';
import { rubricMeansFromNormalizedScores } from '../server/lib/evaluation-revision-gate.ts';
import type { MetaHarnessCliArgs, MetaHarnessConfig } from './config.ts';
import type { RunnerCallbacks } from './runner-types.ts';
import { runCompilePipeline } from './compile-pipeline.ts';
import { hypothesisRubricAbortSignal, withTestCaseHeartbeat } from './eval-heartbeat.ts';
import {
  ARTIFACT,
  DEFAULT_HYPOTHESIS_RUBRIC_TIMEOUT_MS,
  EVAL_META_JSON_WAIT_MS,
} from './constants.ts';

export type RunOneMetaHarnessTestParams = {
  args: MetaHarnessCliArgs;
  cfg: MetaHarnessConfig;
  testCase: SimplifiedMetaHarnessTestCase;
  name: string;
  correlationId: string;
  evalStart: number;
  testResultsDir: string;
  evalRunsBase: string;
  compileProvider: string;
  compileModel: string;
  hypothesisEvalModel: string;
  compileHypothesisCountDefault: number;
  apiKey: string;
  hypothesisGenerateTimeoutMs: number;
  openRouterChatTimeoutMs: number;
  promptOverrides?: Record<string, string>;
  rubricWeights?: Record<string, number>;
  callbacks: RunnerCallbacks;
};

export async function runOneMetaHarnessTest(params: RunOneMetaHarnessTestParams): Promise<{
  overallScore: number | null;
  scored: boolean;
}> {
  const {
    args,
    cfg,
    testCase,
    name,
    correlationId,
    evalStart,
    testResultsDir,
    evalRunsBase,
    compileProvider,
    compileModel,
    hypothesisEvalModel,
    compileHypothesisCountDefault,
    apiKey,
    hypothesisGenerateTimeoutMs,
    openRouterChatTimeoutMs,
    promptOverrides: po,
    rubricWeights: rw,
    callbacks,
  } = params;

  let overallScore: number | null = null;
  let stopReason: string | null = null;
  let errorMessage: string | undefined;
  let baseCorrelationIdOut = correlationId;
  let laneCorrelationId: string | null = null;
  let evalRunDir: string | null = null;
  let sseErrors: string[] = [];
  let compileSummary: Record<string, unknown> | undefined;
  let evalAggregate: AggregatedEvaluationReport | null = null;

  try {
    if (args.mode === 'compile') {
      const { plan, requestedCount } = await runCompilePipeline({
        testCase,
        name,
        cfg,
        compileProvider,
        compileModel,
        compileHypothesisCountDefault,
        promptOverrides: po,
        apiBaseUrl: cfg.apiBaseUrl,
        callbacks,
      });

      const designSpec = buildDesignSpecFromSimplified(testCase.spec);
      const specContext = designSpecToEvalContext(designSpec);

      const hypMeans: number[] = [];
      const perHypothesis: Array<{ id: string; name: string; mean: number }> = [];
      for (const h of plan.hypotheses) {
        if (callbacks.shouldStop?.()) break;
        callbacks.onHypothesisEvalStart?.(name, h.name);
        const rubricSignal = hypothesisRubricAbortSignal(cfg);
        const { mean } = await withTestCaseHeartbeat(name, callbacks, async () => {
          try {
            return await scoreHypothesisWithRubric({
              apiKey,
              model: hypothesisEvalModel,
              specContext,
              hypothesis: h,
              signal: rubricSignal,
              openRouterChatTimeoutMs,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const timedOut =
              (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) ||
              /aborted|timeout/i.test(msg);
            if (timedOut) {
              const limit =
                cfg.hypothesisRubricTimeoutMs === 0
                  ? 'timeout disabled'
                  : `${cfg.hypothesisRubricTimeoutMs ?? DEFAULT_HYPOTHESIS_RUBRIC_TIMEOUT_MS}ms`;
              throw new Error(
                `Hypothesis rubric timed out or was aborted (${limit}) for “${h.name}”. Is OpenRouter slow or blocked?`,
              );
            }
            throw e;
          }
        });
        callbacks.onHypothesisEvalDone?.(name, h.name, mean);
        hypMeans.push(mean);
        perHypothesis.push({ id: h.id, name: h.name, mean });
      }
      overallScore =
        hypMeans.length > 0 ? hypMeans.reduce((a, b) => a + b, 0) / hypMeans.length : null;
      stopReason = 'hypothesis_rubric';
      compileSummary = {
        mode: 'compile',
        incubationPlanId: plan.id,
        perHypothesis,
        requestedHypothesisCount: requestedCount,
      };
    } else {
      let generateBody: Record<string, unknown>;

      if (args.mode === 'e2e') {
        const { plan } = await runCompilePipeline({
          testCase,
          name,
          cfg,
          compileProvider,
          compileModel,
          compileHypothesisCountDefault,
          promptOverrides: po,
          apiBaseUrl: cfg.apiBaseUrl,
          callbacks,
        });
        const picked = plan.hypotheses[Math.floor(Math.random() * plan.hypotheses.length)]!;
        callbacks.onHypothesisPicked?.(name, picked.name);

        generateBody = hydrateMetaHarnessTestCaseFromParsed(testCase, {
          defaultCompilerProvider: cfg.defaultCompilerProvider,
          correlationId,
          promptOverrides: po,
          supportsVision: cfg.supportsVision,
          agenticMaxRevisionRounds: cfg.agenticMaxRevisionRounds,
          rubricWeights: rw,
          strategyOverride: picked,
        }) as unknown as Record<string, unknown>;
      } else {
        generateBody = hydrateMetaHarnessTestCaseFromParsed(testCase, {
          defaultCompilerProvider: cfg.defaultCompilerProvider,
          correlationId,
          promptOverrides: po,
          supportsVision: cfg.supportsVision,
          agenticMaxRevisionRounds: cfg.agenticMaxRevisionRounds,
          rubricWeights: rw,
        }) as unknown as Record<string, unknown>;
      }

      const result = await runHypothesisEvalFromMetaHarness({
        apiBaseUrl: cfg.apiBaseUrl,
        body: generateBody,
        evalRunsBaseDir: evalRunsBase,
        hypothesisGenerateTimeoutMs,
        evalLogWaitMs: EVAL_META_JSON_WAIT_MS,
        onWireEvent(event, payload) {
          callbacks.onWireEvent(name, event, payload);
        },
        onMetaJsonWait(elapsedSec) {
          callbacks.onWireEvent(name, 'meta_json_wait', { elapsedSec });
        },
      });
      overallScore = result.overallScore;
      stopReason = result.stopReason;
      errorMessage = result.errorMessage;
      baseCorrelationIdOut = result.baseCorrelationId;
      laneCorrelationId = result.laneCorrelationId;
      evalRunDir = result.evalRunDir;
      sseErrors = result.sseErrors;
      evalAggregate = result.finalAggregate;
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  const oneResultDir = path.join(testResultsDir, name);
  await mkdir(oneResultDir, { recursive: true });
  if (laneCorrelationId) {
    await writeFile(
      path.join(oneResultDir, ARTIFACT.evalRunIdTxt),
      `${laneCorrelationId}\n`,
      'utf8',
    );
  }
  const rubricMeans =
    evalAggregate?.normalizedScores && Object.keys(evalAggregate.normalizedScores).length > 0
      ? rubricMeansFromNormalizedScores(evalAggregate.normalizedScores)
      : undefined;
  const summary = {
    testCase: name,
    harnessMode: args.mode,
    baseCorrelationId: baseCorrelationIdOut,
    laneCorrelationId,
    overallScore,
    stopReason,
    evalRunDir,
    errorMessage,
    sseErrors,
    ...(compileSummary ? compileSummary : {}),
    ...(rubricMeans && Object.keys(rubricMeans).length > 0 ? { rubricMeans } : {}),
    ...(evalAggregate?.revisionBrief
      ? { revisionBrief: evalAggregate.revisionBrief.slice(0, 800) }
      : {}),
  };
  await writeFile(
    path.join(oneResultDir, ARTIFACT.summaryJson),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );

  const outcome: 'scored' | 'unscored' | 'error' = errorMessage
    ? 'error'
    : typeof overallScore === 'number' && Number.isFinite(overallScore)
      ? 'scored'
      : 'unscored';
  callbacks.onTestCaseDone(
    name,
    overallScore,
    stopReason,
    Date.now() - evalStart,
    errorMessage,
    outcome,
  );

  const scored = typeof overallScore === 'number' && Number.isFinite(overallScore);
  return { overallScore, scored };
}
