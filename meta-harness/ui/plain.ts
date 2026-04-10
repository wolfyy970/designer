/**
 * Console callbacks mirroring the pre-TUI meta-harness output.
 */
import type { MetaHarnessCliArgs } from '../config.ts';
import type { PromotionSummary } from '../promotion-report.ts';
import type { RunnerCallbacks } from '../runner-types.ts';
import { PLAIN_HEARTBEAT_LOG_THROTTLE_MS } from '../constants.ts';
import { bannerLine } from './format-helpers.ts';
import { wirePayloadLine } from './wire-formatters.ts';

/** Plain-mode section header (thin wrapper — callers may import `bannerLine` from `format-helpers`). */
function banner(msg: string): void {
  bannerLine(msg);
}

export function createPlainCallbacks(args: MetaHarnessCliArgs): RunnerCallbacks {
  const lastHeartbeatLogMs = new Map<string, number>();

  return {
    onPreflight(info) {
      banner('Meta-Harness outer loop');
      console.log(`  mode           ${info.mode}`);
      console.log(
        `  iterations     ${info.iterations}${info.evalOnly ? ' (eval-only, no proposer)' : ''}`,
      );
      if (info.testFilters.length) {
        console.log(`  test filter    --test=${info.testFilters.join(' ')} (OR match on basename)`);
      }
      console.log(`  test cases     ${info.testCaseNames.length} (${info.testCaseNames.join(', ')})`);
      console.log(`  API            ${info.cfg.apiBaseUrl}`);
      console.log(`  eval-runs dir  ${info.evalRunsBase}`);
      if (!info.evalOnly) {
        console.log(
          `  proposer       ${info.cfg.proposerModel} (max ${info.cfg.proposerMaxToolRounds} tool rounds)`,
        );
        console.log(
          info.baselineWillRun
            ? '  baseline       yes — eval candidate-0 first (no proposer), then search loop'
            : '  baseline       skipped — eval-only mode (no baseline / proposer iterations)',
        );
      }
      console.log(
        `  revision cap   ${info.cfg.agenticMaxRevisionRounds ?? 'server default'}`,
      );
      console.log();
    },
    onBaselineStart() {
      banner('Baseline (candidate-0)');
      console.log('  No proposer — scoring current repo before the search loop.');
      console.log();
    },
    onIterationStart(_candidateId, iteration, total) {
      void iteration;
      void total;
    },
    onProposerStart(model, maxRounds) {
      banner(`Proposer (${model})`);
      void maxRounds;
    },
    onProposerToolCall(round, toolName, summary) {
      const tag = summary ? ` ${summary}` : '';
      console.log(`  [proposer round ${round + 1}] ${toolName}${tag}`);
    },
    onProposerDone(elapsed, reasoning, roundsUsed, maxRounds) {
      const sec = (elapsed / 1000).toFixed(1);
      console.log(`  proposer done (${sec}s, ${roundsUsed}/${maxRounds} rounds)`);
      console.log(`  reasoning: ${reasoning.slice(0, 120)}${reasoning.length > 120 ? '…' : ''}`);
    },
    onTestCaseStart(index, total, name) {
      banner(`Test ${index + 1}/${total}: ${name} [${args.mode}]`);
    },
    onIncubateStart(testName, hypothesisCount) {
      console.log(`  incubate: ${testName} → request ${hypothesisCount} hypotheses`);
    },
    onIncubateDone(testName, hypotheses) {
      console.log(`  incubate done: ${testName} (${hypotheses.length} hypotheses)`);
    },
    onHypothesisEvalStart(testName, hypothesisName) {
      console.log(`  hypothesis rubric: ${testName} · ${hypothesisName}…`);
    },
    onHypothesisEvalDone(testName, hypothesisName, score) {
      console.log(`  hypothesis rubric: ${testName} · ${hypothesisName} → ${score.toFixed(2)}`);
    },
    onHypothesisPicked(testName, hypothesisName) {
      console.log(`  random pick: ${testName} → ${hypothesisName}`);
    },
    onInputsGenerateStart(testName, target) {
      console.log(`  inputs-generate: ${testName} · ${target}…`);
    },
    onInputsGenerateDone(testName, target, charCount) {
      console.log(`  inputs-generate done: ${testName} · ${target} (${charCount} chars)`);
    },
    onInputsRubricDone(testName, target, mean) {
      console.log(`  inputs rubric: ${testName} · ${target} → ${mean.toFixed(2)}`);
    },
    onWireEvent(testName, event, payload) {
      const prefix = `[${testName}]`;
      const line = wirePayloadLine(event, payload);
      if (line.length > 0) {
        console.log(`  ${prefix} ${line}`);
      }
    },
    onTestCaseHeartbeat(testName, elapsedSec) {
      const now = Date.now();
      const prev = lastHeartbeatLogMs.get(testName) ?? 0;
      if (now - prev < PLAIN_HEARTBEAT_LOG_THROTTLE_MS) return;
      lastHeartbeatLogMs.set(testName, now);
      console.log(`  … still running ${testName} (${elapsedSec}s)`);
    },
    onTestCaseDone(name, score, stopReason, elapsedMsDur, error, outcome) {
      const eff =
        outcome ??
        (error ? 'error' : typeof score === 'number' && Number.isFinite(score) ? 'scored' : 'unscored');
      if (eff === 'error') {
        console.warn(`  ERROR ${name}: ${error ?? 'unknown'}`);
      } else if (eff === 'unscored') {
        const sec = (elapsedMsDur / 1000).toFixed(1);
        console.warn(
          `  ${name} finished (${sec}s) no score (stream/meta incomplete) stop=${stopReason ?? '?'}`,
        );
      } else {
        const sec = (elapsedMsDur / 1000).toFixed(1);
        console.log(`  ${name} done (${sec}s) score=${score?.toFixed(2) ?? 'null'} stop=${stopReason ?? '?'}`);
      }
    },
    onSkippedTestCase(filePath, message) {
      console.warn('  skip invalid test case', filePath, message);
    },
    onIterationDone(info) {
      banner(`Results: ${info.label}`);
      console.log(`  mean score   ${info.meanScore != null ? info.meanScore.toFixed(2) : 'n/a'}`);
      console.log(
        `  best so far  ${
          info.bestCandidateId >= 0
            ? `candidate-${info.bestCandidateId} (${info.bestMeanScore >= 0 ? info.bestMeanScore.toFixed(2) : 'n/a'})`
            : 'none yet'
        }`,
      );
      if (info.isBest) {
        console.log(`  ** new best **`);
      }
      console.log(`  changelog    ${info.changelogRelPath}`);
      console.log();
    },
    onPromotionReport(reportRelPath, summary: PromotionSummary) {
      banner('Promotion report (manual apply)');
      console.log(`  file         ${reportRelPath}`);
      const nSkill = summary.skillsAdded.length + summary.skillsModified.length + summary.skillsDeleted.length;
      console.log(
        `  summary      ${nSkill} skill path(s) differ, rubric ${summary.rubricWeightsChanged ? 'differs' : 'matches repo'}, ${summary.testCasesAdded.length} new test case(s)`,
      );
      if (summary.hasChanges) {
        console.log(`  next step    open the report for step-by-step instructions`);
      } else {
        console.log(`  note         no prompt/skill/rubric/test deltas detected vs repo — still read §7 for proposer notes`);
      }
      console.log();
    },
    onComplete(bestCandidateId, bestMeanScore, historyRelPath, promotionReportRelPath) {
      banner('Done');
      console.log(
        `  ${
          bestCandidateId >= 0
            ? `best candidate-${bestCandidateId} mean=${bestMeanScore >= 0 ? bestMeanScore.toFixed(2) : 'n/a'}`
            : 'no scored candidate'
        }`,
      );
      console.log(`  history in   ${historyRelPath}/`);
      if (promotionReportRelPath) {
        console.log(`  promotion    ${promotionReportRelPath}`);
      }
      console.log();
    },
  };
}
