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
  DEFAULT_INCUBATE_MODEL,
  DEFAULT_HYPOTHESIS_COUNT,
  DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS,
  NO_BEST_SENTINEL,
} from './constants.ts';
import {
  restorePromptsDesignerFromBaseline,
  restoreSkillsFromBaseline,
  savePromptsDesignerBaseline,
  saveSkillsBaseline,
} from './snapshot-helpers.ts';

/** Stable session fields shared across baseline + search-loop candidate phases. */
export type CandidatePhaseInfra = {
  root: string;
  historyDir: string;
  args: MetaHarnessCliArgs;
  cfg: MetaHarnessConfig;
  callbacks: RunnerCallbacks;
  testFiles: string[];
  evalRunsBase: string;
  incubateProvider: string;
  incubateModel: string;
  hypothesisEvalModel: string;
  inputsRubricModel: string;
  incubateHypothesisCountDefault: number;
  apiKey: string;
  iterations: number;
  candidateRows: CandidateScoreRow[];
  bestRef: { mean: number; id: number };
};

/** Per-candidate fields for one {@link runEvaluatedCandidatePhase} invocation. */
export type CandidatePhaseInstance = {
  candidateId: number;
  candidateDir: string;
  label: string;
  proposalMd: string;
  rubricWeights?: Record<string, number>;
  /** Row index for candidateRows / callback (`0` baseline, else loop index). */
  iteration: number;
  iterationLine: string;
  includeProposerSection: boolean;
};

/** Params for {@link runEvaluatedCandidatePhase} — exported for unit tests. */
export type EvaluatedCandidatePhaseParams = {
  infra: CandidatePhaseInfra;
  instance: CandidatePhaseInstance;
};

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
  const incubateProvider = cfg.incubateProvider ?? cfg.defaultIncubatorProvider;
  const incubateModel = cfg.incubateModel ?? DEFAULT_INCUBATE_MODEL;
  const hypothesisEvalModel =
    cfg.hypothesisEvalModel && cfg.hypothesisEvalModel.trim().length > 0
      ? cfg.hypothesisEvalModel.trim()
      : cfg.proposerModel;
  const inputsRubricModel = hypothesisEvalModel;
  const incubateHypothesisCountDefault = cfg.incubateHypothesisCount ?? DEFAULT_HYPOTHESIS_COUNT;
  const openRouterChatTimeoutMs =
    cfg.openRouterChatTimeoutMs ?? DEFAULT_OPENROUTER_CHAT_TIMEOUT_MS;

  const apiKey = process.env.OPENROUTER_API_KEY ?? '';
  if (!args.evalOnly && !apiKey) {
    throw new Error('Set OPENROUTER_API_KEY for the proposer (or use --eval-only)');
  }
  if (args.evalOnly && args.mode === 'incubate' && !apiKey) {
    throw new Error(
      'incubate mode needs OPENROUTER_API_KEY for the hypothesis rubric (even with --eval-only)',
    );
  }
  if (args.evalOnly && args.mode === 'inputs' && !apiKey) {
    throw new Error(
      'inputs mode needs OPENROUTER_API_KEY for the inputs rubric (even with --eval-only)',
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

  const skillsDir = path.join(root, 'skills');
  const skillsBaselineDir = path.join(historyDir, ARTIFACT.skillsBaseline);
  await saveSkillsBaseline(skillsDir, skillsBaselineDir);
  const promptsDesignerDir = path.join(root, 'prompts', 'designer-agentic-system');
  const promptsDesignerBaselineDir = path.join(historyDir, ARTIFACT.promptsDesignerBaseline);
  await savePromptsDesignerBaseline(promptsDesignerDir, promptsDesignerBaselineDir);

  const bestRef = { mean: NO_BEST_SENTINEL, id: NO_BEST_SENTINEL };
  const phaseInfra: CandidatePhaseInfra = {
    root,
    historyDir,
    args,
    cfg,
    callbacks,
    testFiles,
    evalRunsBase,
    incubateProvider,
    incubateModel,
    hypothesisEvalModel,
    inputsRubricModel,
    incubateHypothesisCountDefault,
    apiKey,
    iterations,
    candidateRows,
    bestRef,
  };
  try {
    if (needsBaseline) {
      await runBaselineCandidate(phaseInfra);
    }

    for (let iter = 0; iter < iterations; iter++) {
      if (callbacks.shouldStop?.()) break;

      const candidateId = await nextCandidateId(historyDir);
      const candidateDir = path.join(historyDir, `candidate-${candidateId}`);
      await mkdir(candidateDir, { recursive: true });
      const label = `candidate-${candidateId} (loop ${iter + 1}/${iterations})`;

      callbacks.onIterationStart(candidateId, iter + 1, iterations);

      await restoreSkillsFromBaseline(skillsDir, skillsBaselineDir);
      await restorePromptsDesignerFromBaseline(promptsDesignerDir, promptsDesignerBaselineDir);

      let proposalMd = '';
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
        rubricWeights = proposal.rubricWeights;
        proposalMd = proposal.reasoning;
        callbacks.onProposerDone(
          Date.now() - proposerStart,
          proposalMd,
          proposal.roundsUsed,
          cfg.proposerMaxToolRounds,
        );
        const toolLogMd = proposal.toolLog.length
          ? `\n## Tool calls (${proposal.roundsUsed}/${cfg.proposerMaxToolRounds} rounds)\n\n${proposal.toolLog.map((t) => `- [round ${t.round + 1}] ${t.tool}${t.summary ? ` — ${t.summary}` : ''}`).join('\n')}\n`
          : '';
        await writeFile(path.join(candidateDir, ARTIFACT.proposalMd), `${proposalMd}\n${toolLogMd}`, 'utf8');
        await writeFile(path.join(candidateDir, ARTIFACT.promptOverridesJson), '{}\n', 'utf8');
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
        infra: phaseInfra,
        instance: {
          candidateId,
          candidateDir,
          label,
          proposalMd,
          rubricWeights,
          iteration: iter + 1,
          iterationLine: `${iter + 1} / ${iterations}`,
          includeProposerSection: true,
        },
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
  } finally {
    try {
      await restoreSkillsFromBaseline(skillsDir, skillsBaselineDir);
      await restorePromptsDesignerFromBaseline(promptsDesignerDir, promptsDesignerBaselineDir);
    } catch (e) {
      console.warn(
        '[meta-harness] Failed to restore skills/ or prompts baseline:',
        normalizeError(e),
      );
    }
  }
}

/** Shared: snapshot skills, run all test cases, write changelog/aggregate, update best, notify UI. */
export async function runEvaluatedCandidatePhase(p: EvaluatedCandidatePhaseParams): Promise<void> {
  const { infra, instance } = p;
  const skillsDest = path.join(instance.candidateDir, ARTIFACT.skillsSnapshot);
  await cp(path.join(infra.root, 'skills'), skillsDest, { recursive: true });

  const { meanScore, scores, testResultsDir } = await runTestCasesEvaluation({
    args: infra.args,
    cfg: infra.cfg,
    candidateId: instance.candidateId,
    rubricWeights: instance.rubricWeights,
    testFiles: infra.testFiles,
    evalRunsBase: infra.evalRunsBase,
    incubateProvider: infra.incubateProvider,
    incubateModel: infra.incubateModel,
    hypothesisEvalModel: infra.hypothesisEvalModel,
    inputsRubricModel: infra.inputsRubricModel,
    incubateHypothesisCountDefault: infra.incubateHypothesisCountDefault,
    apiKey: infra.apiKey,
    candidateDir: instance.candidateDir,
    callbacks: infra.callbacks,
  });

  await writeCandidateChangelogAndAggregate({
    candidateDir: instance.candidateDir,
    candidateId: instance.candidateId,
    meanScore,
    scores,
    testFiles: infra.testFiles,
    testResultsDir,
    proposalMd: instance.proposalMd,
    args: infra.args,
    aggregateIteration: instance.iteration,
    iterationLine: instance.iterationLine,
    includeProposerSection: instance.includeProposerSection,
  });

  infra.candidateRows.push({
    candidateId: instance.candidateId,
    meanScore,
    iteration: instance.iteration,
  });

  const improved = meanScore != null && meanScore > infra.bestRef.mean;
  if (improved) {
    infra.bestRef.mean = meanScore;
    infra.bestRef.id = instance.candidateId;
    await writeBestCandidate(infra.historyDir, infra.bestRef.id, infra.bestRef.mean);
  }

  infra.callbacks.onIterationDone({
    candidateId: instance.candidateId,
    meanScore,
    isBest: improved,
    bestCandidateId: infra.bestRef.id,
    bestMeanScore: infra.bestRef.mean,
    changelogRelPath: path.relative(infra.root, path.join(instance.candidateDir, ARTIFACT.changelogMd)),
    label: instance.label,
    iteration: instance.iteration,
    totalIterations: infra.iterations,
  });
}

async function runBaselineCandidate(infra: CandidatePhaseInfra): Promise<void> {
  infra.callbacks.onBaselineStart?.();

  const candidateId = 0;
  const candidateDir = path.join(infra.historyDir, `candidate-${candidateId}`);
  await mkdir(candidateDir, { recursive: true });
  const label = `candidate-${candidateId} (baseline)`;

  const baselineProposal =
    '# Baseline (eval-only)\n\nNo proposer — scoring current repo state before the search loop.\n';
  await writeFile(path.join(candidateDir, ARTIFACT.proposalMd), baselineProposal, 'utf8');
  await writeFile(path.join(candidateDir, ARTIFACT.promptOverridesJson), '{}\n', 'utf8');

  await runEvaluatedCandidatePhase({
    infra,
    instance: {
      candidateId,
      candidateDir,
      label,
      proposalMd: '',
      iteration: 0,
      iterationLine: 'baseline (candidate-0; not counted against configured iterations)',
      includeProposerSection: false,
    },
  });
}
