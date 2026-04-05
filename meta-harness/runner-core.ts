/**
 * Meta-harness outer loop engine — callbacks only, no UI.
 */
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeError } from '../src/lib/error-utils.ts';
import { repoRoot, resolveEvalRunsBaseDir } from './paths.ts';
import { runMetaHarnessProposer } from './proposer.ts';
import { generatePromotionReportMarkdown, type CandidateScoreRow } from './promotion-report.ts';
import { pathIsDir } from './skill-diff.ts';
import {
  filterTestFilesBySubstrings,
  loadConfig,
  type MetaHarnessCliArgs,
  type MetaHarnessConfig,
} from './config.ts';
import { writeBestCandidate, createMetaHarnessSession, nextCandidateId, listTestCaseFiles } from './session.ts';
import { runTestCasesEvaluation } from './candidate-eval.ts';
import { writeCandidateChangelogAndAggregate } from './candidate-artifacts.ts';
import type { RunnerCallbacks } from './runner-types.ts';
import {
  ARTIFACT,
  DEFAULT_COMPILE_MODEL,
  DEFAULT_HYPOTHESIS_COUNT,
  DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS,
  META_HARNESS_BASELINE_PROMPT_OVERRIDES,
  NO_BEST_SENTINEL,
} from './constants.ts';

/** Optional engine tuning; pass `config` to avoid loading disk config twice. */
type RunMetaHarnessEngineOptions = {
  config?: MetaHarnessConfig;
};

export async function runMetaHarnessEngine(
  args: MetaHarnessCliArgs,
  callbacks: RunnerCallbacks,
  options?: RunMetaHarnessEngineOptions,
): Promise<void> {
  const cfg = options?.config ?? (await loadConfig());
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
  const compileHypothesisCountDefault = cfg.compileHypothesisCount ?? DEFAULT_HYPOTHESIS_COUNT;
  const openRouterChatTimeoutMs =
    cfg.openRouterChatTimeoutMs ?? DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS;

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

  const bestRef = { mean: NO_BEST_SENTINEL, id: NO_BEST_SENTINEL };
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
        openRouterChatTimeoutMs,
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

    await runEvaluatedCandidatePhase({
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
      candidateId,
      candidateDir,
      label,
      proposalMd,
      promptOverrides,
      rubricWeights,
      iteration: iter + 1,
      iterationLine: `${iter + 1} / ${iterations}`,
      includeProposerSection: true,
    });
  }

  const { mean: bestMean, id: bestCand } = bestRef;
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
      console.warn('[meta-harness] Failed to write PROMOTION_REPORT.md:', normalizeError(e));
    }
  }

  callbacks.onComplete(bestCand, bestMean, path.relative(root, historyDir), promotionReportRelPath);
}

/** Params for {@link runEvaluatedCandidatePhase} — exported for unit tests. */
export type EvaluatedCandidatePhaseParams = {
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
  candidateId: number;
  candidateDir: string;
  label: string;
  proposalMd: string;
  promptOverrides: Record<string, string>;
  rubricWeights?: Record<string, number>;
  /** Row index for candidateRows / callback (`0` baseline, else loop index). */
  iteration: number;
  iterationLine: string;
  includeProposerSection: boolean;
};

/** Shared: snapshot skills, run all test cases, write changelog/aggregate, update best, notify UI. */
export async function runEvaluatedCandidatePhase(p: EvaluatedCandidatePhaseParams): Promise<void> {
  const skillsDest = path.join(p.candidateDir, ARTIFACT.skillsSnapshot);
  await cp(path.join(p.root, 'skills'), skillsDest, { recursive: true });

  const { meanScore, scores, testResultsDir } = await runTestCasesEvaluation({
    args: p.args,
    cfg: p.cfg,
    candidateId: p.candidateId,
    promptOverrides: p.promptOverrides,
    rubricWeights: p.rubricWeights,
    testFiles: p.testFiles,
    evalRunsBase: p.evalRunsBase,
    compileProvider: p.compileProvider,
    compileModel: p.compileModel,
    hypothesisEvalModel: p.hypothesisEvalModel,
    compileHypothesisCountDefault: p.compileHypothesisCountDefault,
    apiKey: p.apiKey,
    candidateDir: p.candidateDir,
    callbacks: p.callbacks,
  });

  await writeCandidateChangelogAndAggregate({
    candidateDir: p.candidateDir,
    candidateId: p.candidateId,
    meanScore,
    scores,
    testFiles: p.testFiles,
    testResultsDir,
    proposalMd: p.proposalMd,
    promptOverrides: p.promptOverrides,
    args: p.args,
    aggregateIteration: p.iteration,
    iterationLine: p.iterationLine,
    includeProposerSection: p.includeProposerSection,
  });

  p.candidateRows.push({ candidateId: p.candidateId, meanScore, iteration: p.iteration });

  const improved = meanScore != null && meanScore > p.bestRef.mean;
  if (improved) {
    p.bestRef.mean = meanScore;
    p.bestRef.id = p.candidateId;
    await writeBestCandidate(p.historyDir, p.bestRef.id, p.bestRef.mean);
  }

  p.callbacks.onIterationDone({
    candidateId: p.candidateId,
    meanScore,
    isBest: improved,
    bestCandidateId: p.bestRef.id,
    bestMeanScore: p.bestRef.mean,
    changelogRelPath: path.relative(p.root, path.join(p.candidateDir, ARTIFACT.changelogMd)),
    label: p.label,
    iteration: p.iteration,
    totalIterations: p.iterations,
  });
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

  const promptOverrides: Record<string, string> = { ...META_HARNESS_BASELINE_PROMPT_OVERRIDES };

  await runEvaluatedCandidatePhase({
    root,
    historyDir,
    args,
    cfg,
    callbacks,
    testFiles,
    evalRunsBase: params.evalRunsBase,
    compileProvider: params.compileProvider,
    compileModel: params.compileModel,
    hypothesisEvalModel: params.hypothesisEvalModel,
    compileHypothesisCountDefault: params.compileHypothesisCountDefault,
    apiKey,
    iterations,
    candidateRows,
    bestRef,
    candidateId,
    candidateDir,
    label,
    proposalMd: '',
    promptOverrides,
    iteration: 0,
    iterationLine: 'baseline (candidate-0; not counted against configured iterations)',
    includeProposerSection: false,
  });
}
