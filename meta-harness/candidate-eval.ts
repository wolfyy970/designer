/**
 * Per-candidate test-case evaluation loop (compile / e2e / design paths).
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { SimplifiedMetaHarnessTestCaseSchema } from './test-case-hydrator.ts';
import type { MetaHarnessCliArgs, MetaHarnessConfig } from './config.ts';
import type { RunnerCallbacks } from './runner-types.ts';
import {
  DEFAULT_HYPOTHESIS_GENERATE_TIMEOUT_MS,
  DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS,
} from './constants.ts';
import { validateTestCaseShapeForMode } from './candidate-artifacts.ts';
import { runOneMetaHarnessTest } from './run-one-test.ts';

export { runCompilePipeline } from './compile-pipeline.ts';
export { writeCandidateChangelogAndAggregate } from './candidate-artifacts.ts';

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

  const hypothesisGenerateTimeoutMs =
    cfg.hypothesisGenerateTimeoutMs ?? DEFAULT_HYPOTHESIS_GENERATE_TIMEOUT_MS;
  const openRouterChatTimeoutMs =
    cfg.openRouterChatTimeoutMs ?? DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS;

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
    const basename = path.basename(tf, '.json');
    if (parsed.data.name !== basename) {
      callbacks.onSkippedTestCase?.(
        tf,
        'name field must match JSON filename (without .json)',
      );
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

    const { overallScore, scored } = await runOneMetaHarnessTest({
      args,
      cfg,
      testCase: parsed.data,
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
    });
    if (scored && typeof overallScore === 'number' && Number.isFinite(overallScore)) {
      scores.push(overallScore);
    }
  }

  const meanScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return { meanScore, scores, testResultsDir };
}
