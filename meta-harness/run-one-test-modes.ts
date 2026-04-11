/**
 * Per-mode execution paths for {@link runOneMetaHarnessTest} (inputs, incubate, design/e2e).
 */
import type { MetaHarnessHypothesisGenerateBody, SimplifiedMetaHarnessTestCase } from './test-case-hydrator.ts';
import {
  buildDesignSpecFromSimplified,
  hydrateMetaHarnessTestCaseFromParsed,
} from './test-case-hydrator.ts';
import { scoreHypothesisWithRubric, designSpecToEvalContext } from './hypothesis-evaluator.ts';
import { runHypothesisEvalFromMetaHarness } from './evaluator.ts';
import { normalizeError } from '../src/lib/error-utils.ts';
import type { AggregatedEvaluationReport } from '../src/types/evaluation.ts';
import type { MetaHarnessCliArgs, MetaHarnessConfig } from './config.ts';
import type { RunnerCallbacks } from './runner-types.ts';
import { runIncubatePipeline } from './incubate-pipeline.ts';
import { runInputsGeneratePipeline, type InputsFacetTarget } from './inputs-pipeline.ts';
import { hypothesisRubricAbortSignal, withTestCaseHeartbeat } from './eval-heartbeat.ts';
import {
  DEFAULT_HYPOTHESIS_GENERATE_TIMEOUT_MS,
  DEFAULT_HYPOTHESIS_RUBRIC_TIMEOUT_MS,
  DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS,
  EVAL_META_JSON_WAIT_MS,
} from './constants.ts';

/** Per-test invocation state (everything not already on `cfg` / `args`). */
export type RunOneMetaHarnessTestRunContext = {
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
  rubricWeights?: Record<string, number>;
  callbacks: RunnerCallbacks;
  /** Shared per candidate-phase — aborts in-flight HTTP when user stops or between tests. */
  phaseAbort: AbortController;
};

/** Mutable accumulator for one test run — filled by mode executors. */
export type SingleTestBranchAccumulator = {
  overallScore: number | null;
  stopReason: string | null;
  errorMessage: string | undefined;
  baseCorrelationIdOut: string;
  laneCorrelationId: string | null;
  evalRunDir: string | null;
  sseErrors: string[];
  incubateSummary: Record<string, unknown> | undefined;
  evalAggregate: AggregatedEvaluationReport | null;
};

export async function runInputsTestCase(
  testCase: SimplifiedMetaHarnessTestCase,
  cfg: MetaHarnessConfig,
  run: RunOneMetaHarnessTestRunContext,
  acc: SingleTestBranchAccumulator,
): Promise<void> {
  const { name, apiKey, inputsRubricModel, callbacks } = run;
  const openRouterChatTimeoutMs = cfg.openRouterChatTimeoutMs ?? DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS;

  const inputsResult = await runInputsGeneratePipeline({
    testCase,
    apiBaseUrl: cfg.apiBaseUrl,
    inputsGenerateProviderId: testCase.model.providerId,
    inputsGenerateModelId: testCase.model.modelId,
    inputsRubricApiKey: apiKey,
    inputsRubricModel,
    timeoutMs: cfg.inputsGenerateTimeoutMs,
    openRouterChatTimeoutMs,
    signal: run.phaseAbort.signal,
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
  acc.overallScore = inputsResult.overallMean;
  acc.stopReason = 'inputs_rubric';
  acc.incubateSummary = {
    mode: 'inputs',
    perFacet: inputsResult.perFacet.map((s) => ({
      target: s.target,
      charCount: s.generated.length,
      mean: s.rubric?.mean ?? null,
      scores: s.rubric?.scores ?? null,
      error: s.error,
    })),
  };
}

export async function runIncubateTestCase(
  testCase: SimplifiedMetaHarnessTestCase,
  cfg: MetaHarnessConfig,
  run: RunOneMetaHarnessTestRunContext,
  acc: SingleTestBranchAccumulator,
): Promise<void> {
  const {
    name,
    incubateProvider,
    incubateModel,
    hypothesisEvalModel,
    incubateHypothesisCountDefault,
    apiKey,
    callbacks,
  } = run;
  const openRouterChatTimeoutMs = cfg.openRouterChatTimeoutMs ?? DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS;

  const { plan, requestedCount } = await runIncubatePipeline({
    testCase,
    name,
    cfg,
    incubateProvider,
    incubateModel,
    incubateHypothesisCountDefault,
    apiBaseUrl: cfg.apiBaseUrl,
    callbacks,
    phaseAbort: run.phaseAbort,
  });

  const designSpec = buildDesignSpecFromSimplified(testCase.spec);
  const specContext = designSpecToEvalContext(designSpec);

  const hypMeans: number[] = [];
  const perHypothesis: Array<{ id: string; name: string; mean: number }> = [];
  for (const h of plan.hypotheses) {
    if (callbacks.shouldStop?.()) break;
    callbacks.onHypothesisEvalStart?.(name, h.name);
    const rubricSignal = hypothesisRubricAbortSignal(cfg);
    const mergedRubricSignal =
      rubricSignal && run.phaseAbort
        ? AbortSignal.any([rubricSignal, run.phaseAbort.signal])
        : (rubricSignal ?? run.phaseAbort.signal);
    const { mean } = await withTestCaseHeartbeat(
      name,
      callbacks,
      async () => {
        try {
          return await scoreHypothesisWithRubric({
            apiKey,
            model: hypothesisEvalModel,
            specContext,
            hypothesis: h,
            signal: mergedRubricSignal,
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
      },
      { linkUserStop: run.phaseAbort },
    );
    callbacks.onHypothesisEvalDone?.(name, h.name, mean);
    hypMeans.push(mean);
    perHypothesis.push({ id: h.id, name: h.name, mean });
  }
  acc.overallScore =
    hypMeans.length > 0 ? hypMeans.reduce((a, b) => a + b, 0) / hypMeans.length : null;
  acc.stopReason = 'hypothesis_rubric';
  acc.incubateSummary = {
    mode: 'incubate',
    incubationPlanId: plan.id,
    perHypothesis,
    requestedHypothesisCount: requestedCount,
  };
}

export async function runDesignTestCase(
  testCase: SimplifiedMetaHarnessTestCase,
  args: MetaHarnessCliArgs,
  cfg: MetaHarnessConfig,
  run: RunOneMetaHarnessTestRunContext,
  acc: SingleTestBranchAccumulator,
): Promise<void> {
  const {
    name,
    correlationId,
    evalRunsBase,
    inputsRubricModel,
    apiKey,
    rubricWeights: rw,
    incubateProvider,
    incubateModel,
    incubateHypothesisCountDefault,
    callbacks,
  } = run;
  const hypothesisGenerateTimeoutMs =
    cfg.hypothesisGenerateTimeoutMs ?? DEFAULT_HYPOTHESIS_GENERATE_TIMEOUT_MS;
  const openRouterChatTimeoutMs = cfg.openRouterChatTimeoutMs ?? DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS;

  let generateBody: MetaHarnessHypothesisGenerateBody;

  if (args.mode === 'e2e') {
    let e2eTestCase = testCase;
    try {
      const inputsResult = await runInputsGeneratePipeline({
        testCase,
        apiBaseUrl: cfg.apiBaseUrl,
        inputsGenerateProviderId: testCase.model.providerId,
        inputsGenerateModelId: testCase.model.modelId,
        inputsRubricApiKey: apiKey,
        inputsRubricModel,
        timeoutMs: cfg.inputsGenerateTimeoutMs,
        openRouterChatTimeoutMs,
        signal: run.phaseAbort.signal,
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
      apiBaseUrl: cfg.apiBaseUrl,
      callbacks,
      phaseAbort: run.phaseAbort,
    });
    const picked = plan.hypotheses[Math.floor(Math.random() * plan.hypotheses.length)]!;
    callbacks.onHypothesisPicked?.(name, picked.name);

    generateBody = hydrateMetaHarnessTestCaseFromParsed(e2eTestCase, {
      defaultIncubatorProvider: cfg.defaultIncubatorProvider,
      correlationId,
      supportsVision: cfg.supportsVision,
      agenticMaxRevisionRounds: cfg.agenticMaxRevisionRounds,
      rubricWeights: rw,
      strategyOverride: picked,
    });
  } else {
    generateBody = hydrateMetaHarnessTestCaseFromParsed(testCase, {
      defaultIncubatorProvider: cfg.defaultIncubatorProvider,
      correlationId,
      supportsVision: cfg.supportsVision,
      agenticMaxRevisionRounds: cfg.agenticMaxRevisionRounds,
      rubricWeights: rw,
    });
  }

  const result = await runHypothesisEvalFromMetaHarness({
    apiBaseUrl: cfg.apiBaseUrl,
    body: generateBody,
    evalRunsBaseDir: evalRunsBase,
    signal: run.phaseAbort.signal,
    hypothesisGenerateTimeoutMs,
    evalLogWaitMs: EVAL_META_JSON_WAIT_MS,
    onWireEvent(event, payload) {
      callbacks.onWireEvent(name, event, payload);
    },
    onMetaJsonWait(elapsedSec) {
      callbacks.onWireEvent(name, 'meta_json_wait', { elapsedSec });
    },
  });
  acc.overallScore = result.overallScore;
  acc.stopReason = result.stopReason;
  acc.errorMessage = result.errorMessage;
  acc.baseCorrelationIdOut = result.baseCorrelationId;
  acc.laneCorrelationId = result.laneCorrelationId;
  acc.evalRunDir = result.evalRunDir;
  acc.sseErrors = result.sseErrors;
  acc.evalAggregate = result.finalAggregate;
}

export function emptyAccumulator(correlationId: string): SingleTestBranchAccumulator {
  return {
    overallScore: null,
    stopReason: null,
    errorMessage: undefined,
    baseCorrelationIdOut: correlationId,
    laneCorrelationId: null,
    evalRunDir: null,
    sseErrors: [],
    incubateSummary: undefined,
    evalAggregate: null,
  };
}
