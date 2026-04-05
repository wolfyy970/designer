/**
 * Meta-harness outer loop engine — callbacks only, no UI.
 */
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot, resolveEvalRunsBaseDir } from './paths.ts';
import { runMetaHarnessProposer } from './proposer.ts';
import {
  generatePromotionReportMarkdown,
  pathIsDir,
  type CandidateScoreRow,
} from './promotion-report.ts';
import { loadConfig, type MetaHarnessCliArgs, type MetaHarnessConfig } from './config.ts';
import { writeBestCandidate, createMetaHarnessSession, nextCandidateId, listTestCaseFiles } from './session.ts';
import {
  runTestCasesEvaluation,
  writeCandidateChangelogAndAggregate,
} from './candidate-eval.ts';
import { filterTestFilesBySubstrings } from './config.ts';
import type { RunnerCallbacks } from './runner-types.ts';
import { ARTIFACT, DEFAULT_COMPILE_MODEL } from './constants.ts';

export type { MetaHarnessMode } from './modes.ts';
export type { PromotionSummary } from './promotion-report.ts';
export type { MetaHarnessConfig, MetaHarnessCliArgs } from './config.ts';
export {
  loadConfig,
  parseMetaHarnessArgv,
  parseMetaHarnessModeFromArgv,
  resolveMode,
  filterTestFilesBySubstrings,
} from './config.ts';
export type { RunnerCallbacks, RunnerPreflightInfo } from './runner-types.ts';
export { listTestCaseFiles } from './session.ts';
export { runCompileStep } from './compile-step.ts';

export async function runMetaHarnessEngine(
  args: MetaHarnessCliArgs,
  callbacks: RunnerCallbacks,
): Promise<void> {
  const cfg = await loadConfig();
  const root = repoRoot();
  const metaHarnessDir = path.join(root, 'meta-harness');
  const historyRoot = path.join(metaHarnessDir, 'history');
  const testCasesDir = path.join(metaHarnessDir, 'test-cases');
  const evalRunsBase = resolveEvalRunsBaseDir(cfg.evalRunsBaseDir);

  const allTestFilesSorted = (await listTestCaseFiles(testCasesDir)).sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b)),
  );
  if (allTestFilesSorted.length === 0) {
    throw new Error(`No test cases in ${testCasesDir}`);
  }

  const testFiles = filterTestFilesBySubstrings(allTestFilesSorted, args.testFilters);
  if (testFiles.length === 0) {
    const hint =
      args.testFilters.length > 0
        ? ` — no test case JSON basename matched --test=${args.testFilters.join(', ')}`
        : '';
    throw new Error(`No test cases after filters${hint}`);
  }

  const iterations = args.once ? 1 : Math.max(1, cfg.iterations);
  const { sessionDir: historyDir, sessionFolderName } = await createMetaHarnessSession({
    historyRoot,
    mode: args.mode,
    cfg,
    iterations,
  });
  const compileProvider = cfg.compileProvider ?? cfg.defaultCompilerProvider;
  const compileModel = cfg.compileModel ?? DEFAULT_COMPILE_MODEL;
  const hypothesisEvalModel =
    cfg.hypothesisEvalModel && cfg.hypothesisEvalModel.trim().length > 0
      ? cfg.hypothesisEvalModel.trim()
      : cfg.proposerModel;
  const compileHypothesisCountDefault = cfg.compileHypothesisCount ?? 5;

  const apiKey = process.env.OPENROUTER_API_KEY ?? '';
  if (!args.evalOnly && !apiKey) {
    throw new Error('Set OPENROUTER_API_KEY for the proposer (or use --eval-only)');
  }
  if (args.evalOnly && args.mode === 'compile' && !apiKey) {
    throw new Error(
      'compile mode needs OPENROUTER_API_KEY for the hypothesis rubric (even with --eval-only)',
    );
  }

  const testCaseNames = testFiles.map((f) => path.basename(f, '.json'));
  const initialTestCaseNames = new Set(
    allTestFilesSorted.map((f) => path.basename(f, '.json')),
  );
  const candidateRows: CandidateScoreRow[] = [];
  const needsBaseline = !args.evalOnly;
  callbacks.onPreflight({
    cfg,
    mode: args.mode,
    iterations,
    testCaseNames,
    evalRunsBase,
    evalOnly: args.evalOnly,
    testFilters: args.testFilters,
    baselineWillRun: needsBaseline,
  });

  let bestMean = -1;
  let bestCand = -1;
  const bestRef = { mean: bestMean, id: bestCand };
  if (needsBaseline) {
    await runBaselineCandidate({
      root,
      historyDir,
      args,
      cfg,
      callbacks,
      testFiles,
      evalRunsBase,
      compileProvider,
      compileModel,
      hypothesisEvalModel,
      compileHypothesisCountDefault,
      apiKey,
      iterations,
      candidateRows,
      bestRef,
    });
    bestMean = bestRef.mean;
    bestCand = bestRef.id;
  }

  for (let iter = 0; iter < iterations; iter++) {
    if (callbacks.shouldStop?.()) break;

    const candidateId = await nextCandidateId(historyDir);
    const candidateDir = path.join(historyDir, `candidate-${candidateId}`);
    await mkdir(candidateDir, { recursive: true });
    const label = `candidate-${candidateId} (loop ${iter + 1}/${iterations})`;

    callbacks.onIterationStart(candidateId, iter + 1, iterations);

    let proposalMd = '';
    let promptOverrides: Record<string, string> = {};
    let rubricWeights: Record<string, number> | undefined;

    if (!args.evalOnly) {
      if (callbacks.shouldStop?.()) break;
      callbacks.onProposerStart(cfg.proposerModel, cfg.proposerMaxToolRounds);
      const proposerStart = Date.now();
      const proposal = await runMetaHarnessProposer({
        apiKey,
        apiBaseUrl: cfg.apiBaseUrl,
        model: cfg.proposerModel,
        mode: args.mode,
        metaHarnessDir,
        sessionHistoryDir: historyDir,
        historyRootDir: historyRoot,
        currentSessionFolderName: sessionFolderName,
        evalRunsBaseDir: evalRunsBase,
        candidateLabel: label,
        maxToolRounds: cfg.proposerMaxToolRounds,
        onToolCall(round, toolName, summary) {
          callbacks.onProposerToolCall(round, toolName, summary);
        },
      });
      promptOverrides = proposal.promptOverrides;
      rubricWeights = proposal.rubricWeights;
      proposalMd = proposal.reasoning;
      callbacks.onProposerDone(
        Date.now() - proposerStart,
        Object.keys(promptOverrides),
        proposalMd,
        proposal.roundsUsed,
        cfg.proposerMaxToolRounds,
      );
      const toolLogMd = proposal.toolLog.length
        ? `\n## Tool calls (${proposal.roundsUsed}/${cfg.proposerMaxToolRounds} rounds)\n\n${proposal.toolLog.map((t) => `- [round ${t.round + 1}] ${t.tool}${t.summary ? ` — ${t.summary}` : ''}`).join('\n')}\n`
        : '';
      await writeFile(path.join(candidateDir, ARTIFACT.proposalMd), `${proposalMd}\n${toolLogMd}`, 'utf8');
      await writeFile(
        path.join(candidateDir, ARTIFACT.promptOverridesJson),
        `${JSON.stringify(promptOverrides, null, 2)}\n`,
        'utf8',
      );
      if (rubricWeights) {
        await writeFile(
          path.join(candidateDir, ARTIFACT.rubricWeightsJson),
          `${JSON.stringify(rubricWeights, null, 2)}\n`,
          'utf8',
        );
      }
    } else {
      await writeFile(
        path.join(candidateDir, ARTIFACT.proposalMd),
        '# eval-only\nNo proposer — evaluating current repo state.\n',
        'utf8',
      );
      await writeFile(path.join(candidateDir, ARTIFACT.promptOverridesJson), '{}\n', 'utf8');
    }

    const skillsDest = path.join(candidateDir, 'skills-snapshot');
    await cp(path.join(root, 'skills'), skillsDest, { recursive: true });

    const { meanScore, scores, testResultsDir } = await runTestCasesEvaluation({
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
    });

    await writeCandidateChangelogAndAggregate({
      candidateDir,
      candidateId,
      meanScore,
      scores,
      testFiles,
      testResultsDir,
      proposalMd,
      promptOverrides,
      args,
      aggregateIteration: iter + 1,
      iterationLine: `${iter + 1} / ${iterations}`,
      includeProposerSection: true,
    });

    candidateRows.push({ candidateId, meanScore, iteration: iter + 1 });

    const improved = meanScore != null && meanScore > bestMean;
    if (improved) {
      bestMean = meanScore;
      bestCand = candidateId;
      await writeBestCandidate(historyDir, bestCand, bestMean);
    }

    callbacks.onIterationDone({
      candidateId,
      meanScore,
      isBest: improved,
      bestCandidateId: bestCand,
      bestMeanScore: bestMean,
      changelogRelPath: path.relative(root, path.join(candidateDir, ARTIFACT.changelogMd)),
      label,
      iteration: iter + 1,
      totalIterations: iterations,
    });
  }

  let promotionReportRelPath: string | undefined;
  if (
    bestCand >= 0 &&
    bestMean >= 0 &&
    (await pathIsDir(path.join(historyDir, `candidate-${bestCand}`)))
  ) {
    const winningDir = path.join(historyDir, `candidate-${bestCand}`);
    try {
      const { markdown, summary } = await generatePromotionReportMarkdown({
        repoRoot: root,
        winningCandidateDir: winningDir,
        winningCandidateId: bestCand,
        winningMeanScore: bestMean,
        mode: args.mode,
        candidateRows,
        initialTestCaseNames,
        currentTestCasesDir: testCasesDir,
      });
      const reportAbs = path.join(historyDir, ARTIFACT.promotionReportMd);
      await writeFile(reportAbs, markdown, 'utf8');
      promotionReportRelPath = path.relative(root, reportAbs);
      callbacks.onPromotionReport?.(promotionReportRelPath, summary);
    } catch (e) {
      console.warn(
        '[meta-harness] Failed to write PROMOTION_REPORT.md:',
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  callbacks.onComplete(bestCand, bestMean, path.relative(root, historyDir), promotionReportRelPath);
}

async function runBaselineCandidate(params: {
  root: string;
  historyDir: string;
  args: MetaHarnessCliArgs;
  cfg: MetaHarnessConfig;
  callbacks: RunnerCallbacks;
  testFiles: string[];
  evalRunsBase: string;
  compileProvider: string;
  compileModel: string;
  hypothesisEvalModel: string;
  compileHypothesisCountDefault: number;
  apiKey: string;
  iterations: number;
  candidateRows: CandidateScoreRow[];
  bestRef: { mean: number; id: number };
}): Promise<void> {
  const { root, historyDir, args, cfg, callbacks, testFiles, apiKey, iterations, candidateRows, bestRef } =
    params;
  callbacks.onBaselineStart?.();

  const candidateId = 0;
  const candidateDir = path.join(historyDir, `candidate-${candidateId}`);
  await mkdir(candidateDir, { recursive: true });
  const label = `candidate-${candidateId} (baseline)`;

  const baselineProposal =
    '# Baseline (eval-only)\n\nNo proposer — scoring current repo state before the search loop.\n';
  await writeFile(path.join(candidateDir, ARTIFACT.proposalMd), baselineProposal, 'utf8');
  await writeFile(path.join(candidateDir, ARTIFACT.promptOverridesJson), '{}\n', 'utf8');

  const skillsDest = path.join(candidateDir, 'skills-snapshot');
  await cp(path.join(root, 'skills'), skillsDest, { recursive: true });

  const promptOverrides: Record<string, string> = {};

  const { meanScore, scores, testResultsDir } = await runTestCasesEvaluation({
    args,
    cfg,
    candidateId,
    promptOverrides,
    testFiles,
    evalRunsBase: params.evalRunsBase,
    compileProvider: params.compileProvider,
    compileModel: params.compileModel,
    hypothesisEvalModel: params.hypothesisEvalModel,
    compileHypothesisCountDefault: params.compileHypothesisCountDefault,
    apiKey,
    candidateDir,
    callbacks,
  });

  await writeCandidateChangelogAndAggregate({
    candidateDir,
    candidateId,
    meanScore,
    scores,
    testFiles,
    testResultsDir,
    proposalMd: '',
    promptOverrides,
    args,
    aggregateIteration: 0,
    iterationLine: 'baseline (candidate-0; not counted against configured iterations)',
    includeProposerSection: false,
  });

  candidateRows.push({ candidateId, meanScore, iteration: 0 });

  const improved = meanScore != null && meanScore > bestRef.mean;
  if (improved) {
    bestRef.mean = meanScore;
    bestRef.id = candidateId;
    await writeBestCandidate(historyDir, bestRef.id, bestRef.mean);
  }

  callbacks.onIterationDone({
    candidateId,
    meanScore,
    isBest: improved,
    bestCandidateId: bestRef.id,
    bestMeanScore: bestRef.mean,
    changelogRelPath: path.relative(root, path.join(candidateDir, ARTIFACT.changelogMd)),
    label,
    iteration: 0,
    totalIterations: iterations,
  });
}
