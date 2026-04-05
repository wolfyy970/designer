/**
 * Per-candidate test-case evaluation (compile / e2e / design paths) and changelog writing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SimplifiedMetaHarnessTestCase } from './test-case-hydrator.ts';
import { scoreHypothesisWithRubric, designSpecToEvalContext } from './hypothesis-evaluator.ts';
import { runHypothesisEvalFromMetaHarness } from './evaluator.ts';
import {
  buildDesignSpecFromSimplified,
  hydrateCompileRequest,
  hydrateMetaHarnessTestCase,
  SimplifiedMetaHarnessTestCaseSchema,
} from './test-case-hydrator.ts';
import type { IncubationPlan } from '../src/types/compiler.ts';
import type { AggregatedEvaluationReport } from '../src/types/evaluation.ts';
import { rubricMeansFromNormalizedScores } from '../server/lib/evaluation-revision-gate.ts';
import type { MetaHarnessCliArgs, MetaHarnessConfig } from './config.ts';
import { runCompileStep } from './compile-step.ts';
import type { RunnerCallbacks } from './runner-types.ts';
import {
  ARTIFACT,
  DEFAULT_HYPOTHESIS_RUBRIC_TIMEOUT_MS,
  EVAL_META_JSON_WAIT_MS,
  HEARTBEAT_INTERVAL_MS,
} from './constants.ts';
import { TestCaseSummarySchema } from './schemas.ts';
import type { MetaHarnessMode } from './modes.ts';

/** AbortSignal for OpenRouter hypothesis-rubric fetch; undefined when timeout disabled (cfg explicitly 0). */
function hypothesisRubricAbortSignal(cfg: MetaHarnessConfig): AbortSignal | undefined {
  const raw = cfg.hypothesisRubricTimeoutMs;
  if (raw === 0) return undefined;
  const ms = typeof raw === 'number' && raw > 0 ? raw : DEFAULT_HYPOTHESIS_RUBRIC_TIMEOUT_MS;
  return AbortSignal.timeout(ms);
}

/** Shared compile → SSE → callbacks path for `compile` and `e2e` modes. */
export async function runCompilePipeline(params: {
  raw: unknown;
  name: string;
  cfg: MetaHarnessConfig;
  compileProvider: string;
  compileModel: string;
  compileHypothesisCountDefault: number;
  promptOverrides?: Record<string, string>;
  apiBaseUrl: string;
  callbacks: RunnerCallbacks;
}): Promise<{ plan: IncubationPlan; requestedCount: number }> {
  const compileBody = hydrateCompileRequest(params.raw, {
    compileProvider: params.compileProvider,
    compileModel: params.compileModel,
    supportsVision: params.cfg.supportsVision,
    defaultHypothesisCount: params.compileHypothesisCountDefault,
    promptOverrides: params.promptOverrides,
  });
  const requestedCount =
    (compileBody.promptOptions as { count?: number })?.count ?? params.compileHypothesisCountDefault;
  params.callbacks.onCompileStart?.(params.name, requestedCount);

  const plan = await withTestCaseHeartbeat(params.name, params.callbacks, () =>
    runCompileStep(params.apiBaseUrl, compileBody, {
      onWireEvent: (event, payload) => params.callbacks.onWireEvent(params.name, event, payload),
    }),
  );
  if (!plan.hypotheses?.length) {
    throw new Error('Compile returned no hypotheses');
  }
  params.callbacks.onCompileDone?.(
    params.name,
    plan.hypotheses.map((h) => ({ name: h.name, id: h.id })),
  );
  return { plan, requestedCount };
}

async function withTestCaseHeartbeat<T>(
  testName: string,
  callbacks: RunnerCallbacks,
  run: () => Promise<T>,
): Promise<T> {
  if (!callbacks.onTestCaseHeartbeat) {
    return run();
  }
  const t0 = Date.now();
  const id = setInterval(() => {
    callbacks.onTestCaseHeartbeat?.(testName, Math.floor((Date.now() - t0) / 1000));
  }, HEARTBEAT_INTERVAL_MS);
  try {
    return await run();
  } finally {
    clearInterval(id);
  }
}

type TestCasesEvalParams = {
  args: MetaHarnessCliArgs;
  cfg: MetaHarnessConfig;
  candidateId: number;
  promptOverrides: Record<string, string>;
  rubricWeights?: Record<string, number>;
  testFiles: string[];
  evalRunsBase: string;
  compileProvider: string;
  compileModel: string;
  hypothesisEvalModel: string;
  compileHypothesisCountDefault: number;
  apiKey: string;
  candidateDir: string;
  callbacks: RunnerCallbacks;
};

export async function runTestCasesEvaluation(params: TestCasesEvalParams): Promise<{
  meanScore: number | null;
  scores: number[];
  testResultsDir: string;
}> {
  const {
    args,
    cfg,
    candidateId,
    promptOverrides,
    rubricWeights,
    testFiles,
    evalRunsBase,
    compileProvider,
    compileModel,
    hypothesisEvalModel,
    compileHypothesisCountDefault,
    apiKey,
    candidateDir,
    callbacks,
  } = params;

  const scores: number[] = [];
  const testResultsDir = path.join(candidateDir, 'test-results');
  await mkdir(testResultsDir, { recursive: true });

  const po = Object.keys(promptOverrides).length > 0 ? promptOverrides : undefined;
  const rw =
    rubricWeights && Object.keys(rubricWeights).length > 0 ? rubricWeights : undefined;

  for (let ti = 0; ti < testFiles.length; ti++) {
    if (callbacks.shouldStop?.()) break;

    const tf = testFiles[ti]!;

    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(tf, 'utf8')) as unknown;
    } catch (e) {
      callbacks.onSkippedTestCase?.(tf, e instanceof Error ? e.message : String(e));
      continue;
    }

    const parsed = SimplifiedMetaHarnessTestCaseSchema.safeParse(raw);
    if (!parsed.success) {
      callbacks.onSkippedTestCase?.(tf, parsed.error.message);
      continue;
    }
    const name = parsed.data.name;
    const shapeErr = validateTestCaseShapeForMode(args.mode, parsed.data, tf);
    if (shapeErr) {
      callbacks.onSkippedTestCase?.(tf, shapeErr);
      continue;
    }

    const correlationId = `mh-c${candidateId}-${name}-${Date.now()}`;
    callbacks.onTestCaseStart(ti, testFiles.length, name);
    const evalStart = Date.now();

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
          raw,
          name,
          cfg,
          compileProvider,
          compileModel,
          compileHypothesisCountDefault,
          promptOverrides: po,
          apiBaseUrl: cfg.apiBaseUrl,
          callbacks,
        });

        const designSpec = buildDesignSpecFromSimplified(parsed.data.spec);
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
            raw,
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

          generateBody = hydrateMetaHarnessTestCase(raw, {
            defaultCompilerProvider: cfg.defaultCompilerProvider,
            correlationId,
            promptOverrides: po,
            supportsVision: cfg.supportsVision,
            agenticMaxRevisionRounds: cfg.agenticMaxRevisionRounds,
            rubricWeights: rw,
            strategyOverride: picked,
          }) as unknown as Record<string, unknown>;
        } else {
          generateBody = hydrateMetaHarnessTestCase(raw, {
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
    if (typeof overallScore === 'number' && Number.isFinite(overallScore)) {
      scores.push(overallScore);
    }
    callbacks.onTestCaseDone(
      name,
      overallScore,
      stopReason,
      Date.now() - evalStart,
      errorMessage,
    );
  }

  const meanScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return { meanScore, scores, testResultsDir };
}

export async function writeCandidateChangelogAndAggregate(options: {
  candidateDir: string;
  candidateId: number;
  meanScore: number | null;
  scores: number[];
  testFiles: string[];
  testResultsDir: string;
  proposalMd: string;
  promptOverrides: Record<string, string>;
  args: MetaHarnessCliArgs;
  aggregateIteration: number;
  iterationLine: string;
  includeProposerSection: boolean;
}): Promise<void> {
  const {
    candidateDir,
    candidateId,
    meanScore,
    scores,
    testFiles,
    testResultsDir,
    proposalMd,
    promptOverrides,
    args,
    aggregateIteration,
    iterationLine,
    includeProposerSection,
  } = options;

  const changelogLines: string[] = [`# candidate-${candidateId}\n`];
  changelogLines.push(`**Iteration:** ${iterationLine}`);
  changelogLines.push(
    `**Mean score:** ${meanScore != null ? meanScore.toFixed(2) : 'n/a'} (${scores.length} test cases)`,
  );
  if (includeProposerSection && proposalMd && !args.evalOnly) {
    changelogLines.push(`\n## What the proposer changed\n\n${proposalMd}`);
  } else if (proposalMd && !includeProposerSection) {
    changelogLines.push(`\n## Notes\n\n${proposalMd}`);
  }
  const overrideKeys = Object.keys(promptOverrides);
  if (overrideKeys.length) {
    changelogLines.push(
      `\n## Prompt overrides applied\n\n${overrideKeys.map((k) => `- \`${k}\``).join('\n')}`,
    );
  }
  changelogLines.push(`\n## Per-test results\n`);
  changelogLines.push('| Test case | Score | Stop reason |');
  changelogLines.push('|-----------|-------|-------------|');
  for (const tf of testFiles) {
    const tcName = path.basename(tf, '.json');
    const sumPath = path.join(testResultsDir, tcName, ARTIFACT.summaryJson);
    try {
      const raw = JSON.parse(await readFile(sumPath, 'utf8')) as unknown;
      const s = TestCaseSummarySchema.safeParse(raw);
      const scoreStr =
        s.success && s.data.overallScore != null && Number.isFinite(s.data.overallScore)
          ? Number(s.data.overallScore).toFixed(2)
          : 'err';
      const stopStr = s.success ? (s.data.stopReason ?? '?') : '?';
      changelogLines.push(`| ${tcName} | ${scoreStr} | ${stopStr} |`);
    } catch {
      changelogLines.push(`| ${tcName} | err | ? |`);
    }
  }
  changelogLines.push('');
  await writeFile(path.join(candidateDir, ARTIFACT.changelogMd), changelogLines.join('\n'), 'utf8');

  await writeFile(
    path.join(candidateDir, ARTIFACT.aggregateJson),
    `${JSON.stringify({ candidateId, meanScore, scores, iteration: aggregateIteration }, null, 2)}\n`,
    'utf8',
  );
}

function validateTestCaseShapeForMode(
  mode: MetaHarnessMode,
  data: SimplifiedMetaHarnessTestCase,
  filePath: string,
): string | null {
  if (mode === 'design' && !data.strategy) {
    return `${filePath}: design mode requires a "strategy" object in the test case JSON`;
  }
  return null;
}
