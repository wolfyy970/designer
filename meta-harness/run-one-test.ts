/**
 * Evaluate a single meta-harness test case (incubate / e2e / design paths).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MetaHarnessHypothesisGenerateBody, SimplifiedMetaHarnessTestCase } from './test-case-hydrator.ts';
import {
  buildDesignSpecFromSimplified,
  hydrateMetaHarnessTestCaseFromParsed,
} from './test-case-hydrator.ts';
import { scoreHypothesisWithRubric, designSpecToEvalContext } from './hypothesis-evaluator.ts';
import { runHypothesisEvalFromMetaHarness } from './evaluator.ts';
import { normalizeError } from '../src/lib/error-utils.ts';
import type { AggregatedEvaluationReport } from '../src/types/evaluation.ts';
import { rubricMeansFromNormalizedScores } from '../server/lib/evaluation-revision-gate.ts';
import type { MetaHarnessCliArgs, MetaHarnessConfig } from './config.ts';
import type { RunnerCallbacks } from './runner-types.ts';
import { runIncubatePipeline } from './incubate-pipeline.ts';
import { runInputsGeneratePipeline, type InputsFacetTarget } from './inputs-pipeline.ts';
import { hypothesisRubricAbortSignal, withTestCaseHeartbeat } from './eval-heartbeat.ts';
import {
  ARTIFACT,
  DEFAULT_HYPOTHESIS_GENERATE_TIMEOUT_MS,
  DEFAULT_HYPOTHESIS_RUBRIC_TIMEOUT_MS,
  DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS,
  EVAL_META_JSON_WAIT_MS,
  REVISION_BRIEF_MAX_CHARS,
} from './constants.ts';

/** Per-test invocation state (everything not already on `cfg` / `args`). */
type RunOneMetaHarnessTestRunContext = {
  name: string;
  correlationId: string;
  evalStart: number;
  testResultsDir: string;
  evalRunsBase: string;
  incubateProvider: string;
  incubateModel: string;
  hypothesisEvalModel: string;
  /** Model used for the inputs-quality rubric LLM call (inputs + e2e modes). */
  inputsRubricModel: string;
  incubateHypothesisCountDefault: number;
  apiKey: string;
  promptOverrides?: Record<string, string>;
  rubricWeights?: Record<string, number>;
  callbacks: RunnerCallbacks;
};

export async function runOneMetaHarnessTest(
  args: MetaHarnessCliArgs,
  cfg: MetaHarnessConfig,
  testCase: SimplifiedMetaHarnessTestCase,
  run: RunOneMetaHarnessTestRunContext,
): Promise<{
  overallScore: number | null;
  scored: boolean;
}> {
  const {
    name,
    correlationId,
    evalStart,
    testResultsDir,
    evalRunsBase,
    incubateProvider,
    incubateModel,
    hypothesisEvalModel,
    inputsRubricModel,
    incubateHypothesisCountDefault,
    apiKey,
    promptOverrides: po,
    rubricWeights: rw,
    callbacks,
  } = run;

  const hypothesisGenerateTimeoutMs =
    cfg.hypothesisGenerateTimeoutMs ?? DEFAULT_HYPOTHESIS_GENERATE_TIMEOUT_MS;
  const openRouterChatTimeoutMs = cfg.openRouterChatTimeoutMs ?? DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS;

  let overallScore: number | null = null;
  let stopReason: string | null = null;
  let errorMessage: string | undefined;
  let baseCorrelationIdOut = correlationId;
  let laneCorrelationId: string | null = null;
  let evalRunDir: string | null = null;
  let sseErrors: string[] = [];
  let incubateSummary: Record<string, unknown> | undefined;
  let evalAggregate: AggregatedEvaluationReport | null = null;

  try {
    if (args.mode === 'inputs') {
      const inputsResult = await runInputsGeneratePipeline({
        testCase,
        apiBaseUrl: cfg.apiBaseUrl,
        promptOverrides: po,
        inputsGenerateProviderId: testCase.model.providerId,
        inputsGenerateModelId: testCase.model.modelId,
        inputsRubricApiKey: apiKey,
        inputsRubricModel,
        timeoutMs: cfg.inputsGenerateTimeoutMs,
        openRouterChatTimeoutMs,
        onInputsGenerateStart(target: InputsFacetTarget) {
          callbacks.onInputsGenerateStart?.(name, target);
        },
        onInputsGenerateDone(target: InputsFacetTarget, charCount: number) {
          callbacks.onInputsGenerateDone?.(name, target, charCount);
        },
        onInputsRubricDone(target: InputsFacetTarget, mean: number) {
          callbacks.onInputsRubricDone?.(name, target, mean);
        },
      });
      overallScore = inputsResult.overallMean;
      stopReason = 'inputs_rubric';
      incubateSummary = {
        mode: 'inputs',
        perFacet: inputsResult.perFacet.map((s) => ({
          target: s.target,
          charCount: s.generated.length,
          mean: s.rubric?.mean ?? null,
          scores: s.rubric?.scores ?? null,
          error: s.error,
        })),
      };
    } else if (args.mode === 'incubate') {
      const { plan, requestedCount } = await runIncubatePipeline({
        testCase,
        name,
        cfg,
        incubateProvider,
        incubateModel,
        incubateHypothesisCountDefault,
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
            const msg = normalizeError(e);
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
      incubateSummary = {
        mode: 'incubate',
        incubationPlanId: plan.id,
        perHypothesis,
        requestedHypothesisCount: requestedCount,
      };
    } else {
      let generateBody: MetaHarnessHypothesisGenerateBody;

      if (args.mode === 'e2e') {
        let e2eTestCase = testCase;
        try {
          const inputsResult = await runInputsGeneratePipeline({
            testCase,
            apiBaseUrl: cfg.apiBaseUrl,
            promptOverrides: po,
            inputsGenerateProviderId: testCase.model.providerId,
            inputsGenerateModelId: testCase.model.modelId,
            inputsRubricApiKey: apiKey,
            inputsRubricModel,
            timeoutMs: cfg.inputsGenerateTimeoutMs,
            openRouterChatTimeoutMs,
            onInputsGenerateStart(target: InputsFacetTarget) {
              callbacks.onInputsGenerateStart?.(name, target);
            },
            onInputsGenerateDone(target: InputsFacetTarget, charCount: number) {
              callbacks.onInputsGenerateDone?.(name, target, charCount);
            },
            onInputsRubricDone(target: InputsFacetTarget, mean: number) {
              callbacks.onInputsRubricDone?.(name, target, mean);
            },
          });
          const mergedSections = { ...testCase.spec.sections };
          for (const [key, val] of Object.entries(inputsResult.generatedByFacet)) {
            if (val) mergedSections[key] = val;
          }
          e2eTestCase = { ...testCase, spec: { ...testCase.spec, sections: mergedSections } };
        } catch (e) {
          callbacks.onWireEvent(name, 'inputs_generate_fallback', {
            error: normalizeError(e),
          });
        }

        const { plan } = await runIncubatePipeline({
          testCase: e2eTestCase,
          name,
          cfg,
          incubateProvider,
          incubateModel,
          incubateHypothesisCountDefault,
          promptOverrides: po,
          apiBaseUrl: cfg.apiBaseUrl,
          callbacks,
        });
        const picked = plan.hypotheses[Math.floor(Math.random() * plan.hypotheses.length)]!;
        callbacks.onHypothesisPicked?.(name, picked.name);

        generateBody = hydrateMetaHarnessTestCaseFromParsed(e2eTestCase, {
          defaultIncubatorProvider: cfg.defaultIncubatorProvider,
          correlationId,
          promptOverrides: po,
          supportsVision: cfg.supportsVision,
          agenticMaxRevisionRounds: cfg.agenticMaxRevisionRounds,
          rubricWeights: rw,
          strategyOverride: picked,
        });
      } else {
        generateBody = hydrateMetaHarnessTestCaseFromParsed(testCase, {
          defaultIncubatorProvider: cfg.defaultIncubatorProvider,
          correlationId,
          promptOverrides: po,
          supportsVision: cfg.supportsVision,
          agenticMaxRevisionRounds: cfg.agenticMaxRevisionRounds,
          rubricWeights: rw,
        });
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
    errorMessage = normalizeError(e);
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
    ...(incubateSummary ? incubateSummary : {}),
    ...(rubricMeans && Object.keys(rubricMeans).length > 0 ? { rubricMeans } : {}),
    ...(evalAggregate?.revisionBrief
      ? { revisionBrief: evalAggregate.revisionBrief.slice(0, REVISION_BRIEF_MAX_CHARS) }
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
