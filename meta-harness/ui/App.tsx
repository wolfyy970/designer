import { Box, useApp, useInput } from 'ink';
import { useEffect, useReducer, useRef } from 'react';
import { INK_EXIT_DELAY_MS } from '../constants.ts';
import type { MetaHarnessCliArgs, MetaHarnessConfig } from '../config.ts';
import { runMetaHarnessEngine } from '../runner-core.ts';
import { ActivityLog } from './ActivityLog.tsx';
import { Header } from './Header.tsx';
import { ProposerPanel } from './ProposerPanel.tsx';
import { Scoreboard } from './Scoreboard.tsx';
import { StatusBar } from './StatusBar.tsx';
import { Summary } from './Summary.tsx';
import { TestCaseTable } from './TestCaseTable.tsx';
import { createInitialState, reduceRunnerState } from './state.ts';
import type { RunnerAction } from './state.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';

export function App({ args, config }: { args: MetaHarnessCliArgs; config: MetaHarnessConfig }) {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reduceRunnerState, undefined, createInitialState);
  const stopRef = useRef(false);

  useInput((input) => {
    if (input === 'q') {
      stopRef.current = true;
      dispatch({ type: 'QUIT_REQUESTED' });
    }
    if (input === 'd') {
      dispatch({ type: 'TOGGLE_DETAIL' });
    }
  });

  useEffect(() => {
    let mounted = true;
    const shouldStop = () => stopRef.current;

    const run = async () => {
      const dispatchAction = (action: RunnerAction) => {
        if (mounted) dispatch(action);
      };

      try {
        await runMetaHarnessEngine(
          args,
          {
          onPreflight: (info) => dispatchAction({ type: 'PREFLIGHT', payload: info }),
          onBaselineStart: () => dispatchAction({ type: 'BASELINE_START' }),
          onIterationStart: (candidateId, iteration, total) =>
            dispatchAction({ type: 'ITERATION_START', candidateId, iteration, total }),
          onProposerStart: (model, maxRounds) =>
            dispatchAction({ type: 'PROPOSER_START', model, maxRounds }),
          onProposerToolCall: (round, toolName, summary) =>
            dispatchAction({ type: 'PROPOSER_TOOL', round, toolName, summary }),
          onProposerDone: (elapsedMs, overrides, reasoning, roundsUsed, maxRounds) =>
            dispatchAction({ type: 'PROPOSER_DONE', elapsedMs, overrides, reasoning, roundsUsed, maxRounds }),
          onTestCaseStart: (index, total, name) =>
            dispatchAction({ type: 'TEST_START', index, total, name }),
          onWireEvent: (testName, event, payload) =>
            dispatchAction({ type: 'WIRE', testName, event, payload }),
          onTestCaseHeartbeat: (testName, elapsedSec) =>
            dispatchAction({ type: 'HEARTBEAT', testName, elapsedSec }),
          onTestCaseDone: (name, score, stopReason, elapsedMs, error, outcome) =>
            dispatchAction({ type: 'TEST_DONE', name, score, stopReason, elapsedMs, error, outcome }),
          onSkippedTestCase: (filePath, message) =>
            dispatchAction({ type: 'SKIPPED_TEST', filePath, message }),
          onIncubateStart: (testName, hypothesisCount) =>
            dispatchAction({ type: 'INCUBATE_START', testName, hypothesisCount }),
          onIncubateDone: (testName, hypotheses) =>
            dispatchAction({
              type: 'INCUBATE_DONE',
              testName,
              hypothesisNames: hypotheses.map((h) => h.name),
            }),
          onHypothesisEvalStart: (testName, hypothesisName) =>
            dispatchAction({ type: 'HYPOTHESIS_EVAL_START', testName, hypothesisName }),
          onHypothesisEvalDone: (testName, hypothesisName, score) =>
            dispatchAction({ type: 'HYPOTHESIS_EVAL_DONE', testName, hypothesisName, score }),
          onHypothesisPicked: (testName, hypothesisName) =>
            dispatchAction({ type: 'HYPOTHESIS_PICKED', testName, hypothesisName }),
          onInputsGenerateStart: (testName, target) =>
            dispatchAction({ type: 'INPUTS_GENERATE_START', testName, target }),
          onInputsGenerateDone: (testName, target, charCount) =>
            dispatchAction({ type: 'INPUTS_GENERATE_DONE', testName, target, charCount }),
          onInputsRubricDone: (testName, target, mean) =>
            dispatchAction({ type: 'INPUTS_RUBRIC_DONE', testName, target, mean }),
          onIterationDone: (info) =>
            dispatchAction({
              type: 'ITERATION_DONE',
              candidateId: info.candidateId,
              meanScore: info.meanScore,
              isBest: info.isBest,
              bestCandidateId: info.bestCandidateId,
              bestMeanScore: info.bestMeanScore,
              changelogRelPath: info.changelogRelPath,
              label: info.label,
            }),
          onPromotionReport: (reportPath, summary) =>
            dispatchAction({ type: 'PROMOTION_REPORT', reportPath, summary }),
          onComplete: (bestCandidateId, bestMeanScore, historyRelPath, promotionReportRelPath) =>
            dispatchAction({
              type: 'COMPLETE',
              bestCandidateId,
              bestMeanScore,
              historyRelPath,
              promotionReportRelPath,
            }),
          shouldStop,
        },
          { config },
        );
      } catch (e) {
        dispatchAction({
          type: 'SET_ERROR',
          message: normalizeError(e),
        });
      } finally {
        await new Promise((r) => setTimeout(r, INK_EXIT_DELAY_MS));
        if (mounted) exit();
      }
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [args, config, exit]);

  return (
    <ErrorBoundary>
      <Box flexDirection="column" width="100%">
        <Header state={state} />
        <Box flexDirection="column" flexGrow={1} gap={1} marginY={1}>
          {state.finished ? (
            <Summary state={state} />
          ) : (
            <>
              <TestCaseTable state={state} />
              <ActivityLog items={state.activityItems} />
              <ProposerPanel state={state} />
              <Scoreboard state={state} />
            </>
          )}
        </Box>
        <StatusBar state={state} />
      </Box>
    </ErrorBoundary>
  );
}
