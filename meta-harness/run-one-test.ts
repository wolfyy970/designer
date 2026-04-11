/**
 * Evaluate a single meta-harness test case (incubate / e2e / design paths).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SimplifiedMetaHarnessTestCase } from './test-case-hydrator.ts';
import { normalizeError } from '../src/lib/error-utils.ts';
import { rubricMeansFromNormalizedScores } from '../server/lib/evaluation-revision-gate.ts';
import type { MetaHarnessCliArgs, MetaHarnessConfig } from './config.ts';
import {
  emptyAccumulator,
  runDesignTestCase,
  runIncubateTestCase,
  runInputsTestCase,
  type RunOneMetaHarnessTestRunContext,
} from './run-one-test-modes.ts';
import { ARTIFACT, REVISION_BRIEF_MAX_CHARS } from './constants.ts';

export type { RunOneMetaHarnessTestRunContext } from './run-one-test-modes.ts';

export async function runOneMetaHarnessTest(
  args: MetaHarnessCliArgs,
  cfg: MetaHarnessConfig,
  testCase: SimplifiedMetaHarnessTestCase,
  run: RunOneMetaHarnessTestRunContext,
): Promise<{
  overallScore: number | null;
  scored: boolean;
}> {
  const { name, correlationId, evalStart, testResultsDir, callbacks } = run;

  const acc = emptyAccumulator(correlationId);

  try {
    if (args.mode === 'inputs') {
      await runInputsTestCase(testCase, cfg, run, acc);
    } else if (args.mode === 'incubate') {
      await runIncubateTestCase(testCase, cfg, run, acc);
    } else {
      await runDesignTestCase(testCase, args, cfg, run, acc);
    }
  } catch (e) {
    acc.errorMessage = normalizeError(e);
  }

  const {
    overallScore,
    stopReason,
    errorMessage,
    baseCorrelationIdOut,
    laneCorrelationId,
    evalRunDir,
    sseErrors,
    incubateSummary,
    evalAggregate,
  } = acc;

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
