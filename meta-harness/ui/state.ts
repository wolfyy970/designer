import path from 'node:path';
import { NO_BEST_SENTINEL } from '../constants.ts';
import type { PromotionSummary } from '../promotion-report.ts';
import type { RunnerPreflightInfo } from '../runner-types.ts';
import type { MetaHarnessMode } from '../modes.ts';
import { wireDetailSnippet, wirePayloadLine } from './wire-formatters.ts';
import {
  ACTIVITY_ERROR_SNIPPET_MAX,
  DETAIL_LINES_MAX,
  LIVE_LINE_ERROR_MAX,
  PROPOSER_TOOL_LOG_MAX,
  REASONING_PREVIEW_MAX,
} from './ui-constants.ts';

type TestRowStatus = 'pending' | 'running' | 'done' | 'unscored' | 'error' | 'skipped';

export type TestRowState = {
  name: string;
  status: TestRowStatus;
  score: number | null;
  stopReason: string | null;
  liveLine: string;
  phase: string | null;
  elapsedLabel: string;
  /** Wall time when this test entered `running` (for live elapsed in TUI). */
  startedAtMs: number | null;
  /** Last heartbeat seconds from runner (compile / rubric waits). */
  lastHeartbeatSec: number | null;
  detailLines: string[];
  skipReason?: string;
};

type ProposerState = {
  phase: 'idle' | 'running' | 'done';
  model: string;
  maxRounds: number;
  currentRound: number;
  currentTool: string;
  toolLog: Array<{ round: number; tool: string; summary: string }>;
  doneElapsedMs: number | null;
  reasoningPreview: string;
};

export type ActivityItem = { id: number; text: string; atMs: number };

type SummaryRow = { candidateId: number; meanScore: number | null };

export type RunnerState = {
  runStartedAt: number;
  globalPhase: string;
  harnessMode: MetaHarnessMode;
  iterationsTotal: number;
  currentIteration: number;
  candidateId: number;
  candidateLabel: string;
  evalOnly: boolean;
  cfgSummary: {
    apiBaseUrl: string;
    evalRunsBase: string;
    proposerModel: string;
    revisionCap: string;
  };
  testRows: TestRowState[];
  proposer: ProposerState;
  activeTestName: string | null;
  /** Last test that received an SSE event (for detail pane when idle between events). */
  lastDetailTestName: string | null;
  bestCandidateId: number;
  bestMeanScore: number;
  newBestThisIteration: boolean;
  runningMean: number | null;
  completedTests: number;
  activityItems: ActivityItem[];
  showDetail: boolean;
  finished: boolean;
  quitRequested: boolean;
  summaryRows: SummaryRow[];
  historyRelPath: string;
  finalBestId: number;
  finalBestMean: number;
  error: string | null;
  changelogRelPath: string;
  promotionReportRelPath: string;
  promotionSummary: PromotionSummary | null;
};

let globalActivitySeq = 0;

function nextActivityId(): number {
  globalActivitySeq += 1;
  return globalActivitySeq;
}

function emptyTestRow(name: string): TestRowState {
  return {
    name,
    status: 'pending',
    score: null,
    stopReason: null,
    liveLine: '',
    phase: null,
    elapsedLabel: '',
    startedAtMs: null,
    lastHeartbeatSec: null,
    detailLines: [],
  };
}

/**
 * While any row is still pending or running, more test-case work may run for this candidate.
 * Otherwise we're between tests and the runner is about to write changelog / end the batch.
 */
export function globalPhaseAfterTestWork(rows: TestRowState[]): 'evaluating' | 'finalizing candidate…' {
  const workloadRemaining = rows.some((r) => r.status === 'pending' || r.status === 'running');
  return workloadRemaining ? 'evaluating' : 'finalizing candidate…';
}

function initialProposer(): ProposerState {
  return {
    phase: 'idle',
    model: '',
    maxRounds: 0,
    currentRound: 0,
    currentTool: '',
    toolLog: [],
    doneElapsedMs: null,
    reasoningPreview: '',
  };
}

export function createInitialState(): RunnerState {
  return {
    runStartedAt: Date.now(),
    globalPhase: 'starting',
    harnessMode: 'design',
    iterationsTotal: 1,
    currentIteration: 0,
    candidateId: 0,
    candidateLabel: '',
    evalOnly: false,
    cfgSummary: {
      apiBaseUrl: '',
      evalRunsBase: '',
      proposerModel: '',
      revisionCap: '',
    },
    testRows: [],
    proposer: initialProposer(),
    activeTestName: null,
    lastDetailTestName: null,
    bestCandidateId: NO_BEST_SENTINEL,
    bestMeanScore: NO_BEST_SENTINEL,
    newBestThisIteration: false,
    runningMean: null,
    completedTests: 0,
    activityItems: [],
    showDetail: false,
    finished: false,
    quitRequested: false,
    summaryRows: [],
    historyRelPath: '',
    finalBestId: NO_BEST_SENTINEL,
    finalBestMean: NO_BEST_SENTINEL,
    error: null,
    changelogRelPath: '',
    promotionReportRelPath: '',
    promotionSummary: null,
  };
}

function pushActivity(state: RunnerState, text: string): RunnerState {
  const id = nextActivityId();
  const atMs = Date.now();
  return {
    ...state,
    activityItems: [...state.activityItems, { id, text, atMs }],
  };
}

function appendDetail(row: TestRowState, line: string, max = DETAIL_LINES_MAX): TestRowState {
  const next = [...row.detailLines, line];
  return { ...row, detailLines: next.slice(-max) };
}

export type RunnerAction =
  | { type: 'PREFLIGHT'; payload: RunnerPreflightInfo }
  | { type: 'BASELINE_START' }
  | { type: 'ITERATION_START'; candidateId: number; iteration: number; total: number }
  | { type: 'PROPOSER_START'; model: string; maxRounds: number }
  | { type: 'PROPOSER_TOOL'; round: number; toolName: string; summary: string }
  | { type: 'PROPOSER_DONE'; elapsedMs: number; reasoning: string; roundsUsed: number; maxRounds: number }
  | { type: 'TEST_START'; index: number; total: number; name: string }
  | { type: 'WIRE'; testName: string; event: string; payload: unknown }
  | {
      type: 'TEST_DONE';
      name: string;
      score: number | null;
      stopReason: string | null;
      elapsedMs: number;
      error?: string;
      outcome?: 'scored' | 'unscored' | 'error';
    }
  | {
      type: 'ITERATION_DONE';
      candidateId: number;
      meanScore: number | null;
      isBest: boolean;
      bestCandidateId: number;
      bestMeanScore: number;
      changelogRelPath: string;
      label: string;
    }
  | { type: 'PROMOTION_REPORT'; reportPath: string; summary: PromotionSummary }
  | {
      type: 'COMPLETE';
      bestCandidateId: number;
      bestMeanScore: number;
      historyRelPath: string;
      promotionReportRelPath?: string;
    }
  | { type: 'TOGGLE_DETAIL' }
  | { type: 'QUIT_REQUESTED' }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'SET_GLOBAL_PHASE'; phase: string }
  | { type: 'SKIPPED_TEST'; filePath: string; message: string }
  /** Per-test heartbeat while waiting on non-SSE work (compile poll, rubric). */
  | { type: 'HEARTBEAT'; testName: string; elapsedSec: number }
  | { type: 'INCUBATE_START'; testName: string; hypothesisCount: number }
  | { type: 'INCUBATE_DONE'; testName: string; hypothesisNames: string[] }
  | { type: 'HYPOTHESIS_EVAL_START'; testName: string; hypothesisName: string }
  | { type: 'HYPOTHESIS_EVAL_DONE'; testName: string; hypothesisName: string; score: number }
  | { type: 'HYPOTHESIS_PICKED'; testName: string; hypothesisName: string }
  | { type: 'INPUTS_GENERATE_START'; testName: string; target: string }
  | { type: 'INPUTS_GENERATE_DONE'; testName: string; target: string; charCount: number }
  | { type: 'INPUTS_RUBRIC_DONE'; testName: string; target: string; mean: number };

function reducePreflight(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'PREFLIGHT' }>,
): RunnerState {
  const { cfg, mode, iterations, testCaseNames, evalRunsBase, evalOnly, testFilters, baselineWillRun } =
    action.payload;
  const rows = testCaseNames.map((n) => emptyTestRow(n));
  let next: RunnerState = {
    ...state,
    globalPhase: evalOnly ? 'eval-only run' : baselineWillRun ? 'baseline next' : 'ready',
    harnessMode: mode,
    iterationsTotal: iterations,
    evalOnly,
    cfgSummary: {
      apiBaseUrl: cfg.apiBaseUrl,
      evalRunsBase,
      proposerModel: cfg.proposerModel,
      revisionCap:
        cfg.agenticMaxRevisionRounds != null ? String(cfg.agenticMaxRevisionRounds) : 'server default',
    },
    testRows: rows,
    proposer: initialProposer(),
    candidateLabel: '',
  };
  if (testFilters.length) {
    next = pushActivity(next, `Test filter: --test=${testFilters.join(' ')} (OR match on JSON basename)`);
  }
  if (!evalOnly && baselineWillRun) {
    next = pushActivity(
      next,
      'Baseline scheduled: candidate-0 (eval only) runs before the first proposer in this session.',
    );
  }
  return next;
}

function reduceBaselineStart(state: RunnerState): RunnerState {
  const names = state.testRows.map((r) => r.name);
  const fresh = names.map((n) => emptyTestRow(n));
  let next: RunnerState = {
    ...state,
    candidateId: 0,
    currentIteration: 0,
    candidateLabel: 'candidate-0 (baseline)',
    testRows: fresh,
    proposer: initialProposer(),
    activeTestName: null,
    lastDetailTestName: null,
    newBestThisIteration: false,
    runningMean: null,
    completedTests: 0,
    globalPhase: 'baseline (no proposer)',
  };
  next = pushActivity(next, 'Baseline: evaluating candidate-0 (no proposer)…');
  return next;
}

function reduceIterationStart(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'ITERATION_START' }>,
): RunnerState {
  const names = state.testRows.map((r) => r.name);
  const fresh = names.map((n) => emptyTestRow(n));
  return {
    ...state,
    candidateId: action.candidateId,
    currentIteration: action.iteration,
    iterationsTotal: action.total,
    candidateLabel: `candidate-${action.candidateId} · loop ${action.iteration}/${action.total}`,
    testRows: fresh,
    proposer: initialProposer(),
    activeTestName: null,
    lastDetailTestName: null,
    newBestThisIteration: false,
    runningMean: null,
    completedTests: 0,
    globalPhase: state.evalOnly ? 'evaluating' : 'proposer',
  };
}

function reduceProposerStart(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'PROPOSER_START' }>,
): RunnerState {
  return {
    ...state,
    globalPhase: 'proposer',
    proposer: {
      ...state.proposer,
      phase: 'running',
      model: action.model,
      maxRounds: action.maxRounds,
      currentRound: 0,
      currentTool: '',
      toolLog: [],
    },
  };
}

function reduceProposerTool(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'PROPOSER_TOOL' }>,
): RunnerState {
  const entry = { round: action.round, tool: action.toolName, summary: action.summary };
  const log = [...state.proposer.toolLog, entry].slice(-PROPOSER_TOOL_LOG_MAX);
  return {
    ...state,
    proposer: {
      ...state.proposer,
      currentRound: action.round + 1,
      currentTool: action.toolName,
      toolLog: log,
    },
  };
}

function reduceProposerDone(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'PROPOSER_DONE' }>,
): RunnerState {
  const ms = action.elapsedMs;
  const prev = `${(ms / 1000).toFixed(1)}s`;
  let next: RunnerState = {
    ...state,
    globalPhase: 'evaluating',
    proposer: {
      ...state.proposer,
      phase: 'done' as const,
      doneElapsedMs: ms,
      reasoningPreview:
        action.reasoning.slice(0, REASONING_PREVIEW_MAX) +
        (action.reasoning.length > REASONING_PREVIEW_MAX ? '…' : ''),
    },
  };
  next = pushActivity(
    next,
    `Proposer done (${prev}, ${action.roundsUsed}/${action.maxRounds} rounds)`,
  );
  return next;
}

function reduceTestStart(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'TEST_START' }>,
): RunnerState {
  const started = Date.now();
  const rows = state.testRows.map((r) =>
    r.name === action.name
      ? {
          ...r,
          status: 'running' as const,
          liveLine: '',
          phase: null,
          detailLines: [],
          startedAtMs: started,
          lastHeartbeatSec: null,
        }
      : r,
  );
  return {
    ...state,
    activeTestName: action.name,
    globalPhase: `test ${action.index + 1}/${action.total}`,
    testRows: rows,
  };
}

function reduceHeartbeat(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'HEARTBEAT' }>,
): RunnerState {
  const rows = state.testRows.map((r) =>
    r.name === action.testName ? { ...r, lastHeartbeatSec: action.elapsedSec } : r,
  );
  return { ...state, testRows: rows };
}

function reduceWire(state: RunnerState, action: Extract<RunnerAction, { type: 'WIRE' }>): RunnerState {
  const line = wirePayloadLine(action.event, action.payload);
  const rows = state.testRows.map((r) => {
    if (r.name !== action.testName) return r;
    let nr = { ...r, liveLine: line };
    if (action.event === 'phase') {
      const p = action.payload as { phase?: string } | null;
      nr = { ...nr, phase: p?.phase ?? null };
    }
    if (state.showDetail) {
      nr = appendDetail(nr, wireDetailSnippet(action.event, action.payload));
    }
    return nr;
  });
  return { ...state, testRows: rows, lastDetailTestName: action.testName };
}

function reduceTestDone(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'TEST_DONE' }>,
): RunnerState {
  const elapsed = `${(action.elapsedMs / 1000).toFixed(1)}s`;
  const inferredOutcome: 'scored' | 'unscored' | 'error' =
    action.outcome ??
    (action.error
      ? 'error'
      : typeof action.score === 'number' && Number.isFinite(action.score)
        ? 'scored'
        : 'unscored');
  const rows = state.testRows.map((r) => {
    if (r.name !== action.name) return r;
    if (inferredOutcome === 'error') {
      return {
        ...r,
        status: 'error' as const,
        score: action.score,
        stopReason: action.stopReason,
        elapsedLabel: elapsed,
        liveLine: (action.error ?? 'error').slice(0, LIVE_LINE_ERROR_MAX),
        phase: null,
        startedAtMs: null,
        lastHeartbeatSec: null,
      };
    }
    if (inferredOutcome === 'unscored') {
      return {
        ...r,
        status: 'unscored' as const,
        score: action.score,
        stopReason: action.stopReason,
        elapsedLabel: elapsed,
        liveLine: 'no score (incomplete eval)',
        phase: null,
        startedAtMs: null,
        lastHeartbeatSec: null,
      };
    }
    return {
      ...r,
      status: 'done' as const,
      score: action.score,
      stopReason: action.stopReason,
      elapsedLabel: elapsed,
      liveLine: '',
      phase: null,
      startedAtMs: null,
      lastHeartbeatSec: null,
    };
  });
  const completed = rows.filter(
    (r) => r.status === 'done' || r.status === 'error' || r.status === 'unscored',
  ).length;
  const scored = rows.filter(
    (r) => r.status === 'done' && typeof r.score === 'number' && Number.isFinite(r.score),
  );
  const mean =
    scored.length > 0 ? scored.reduce((a, r) => a + (r.score as number), 0) / scored.length : null;
  const phaseAfterTest = state.quitRequested ? state.globalPhase : globalPhaseAfterTestWork(rows);
  let next: RunnerState = {
    ...state,
    testRows: rows,
    completedTests: completed,
    runningMean: mean,
    activeTestName: null,
    globalPhase: phaseAfterTest,
  };
  const scoreStr = action.score != null ? action.score.toFixed(2) : 'null';
  let activityLine: string;
  if (inferredOutcome === 'error') {
    activityLine = `ERROR ${action.name}: ${(action.error ?? 'unknown').slice(0, ACTIVITY_ERROR_SNIPPET_MAX)}`;
  } else if (inferredOutcome === 'unscored') {
    activityLine = `${action.name} finished (${elapsed}) no score · stop=${action.stopReason ?? '?'}`;
  } else {
    activityLine = `${action.name} done (${elapsed}) score=${scoreStr} stop=${action.stopReason ?? '?'}`;
  }
  next = pushActivity(next, activityLine);
  return next;
}

function reduceIterationDone(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'ITERATION_DONE' }>,
): RunnerState {
  const meanStr = action.meanScore != null ? action.meanScore.toFixed(2) : 'n/a';
  let next: RunnerState = {
    ...state,
    bestCandidateId: action.bestCandidateId,
    bestMeanScore: action.bestMeanScore,
    newBestThisIteration: action.isBest,
    changelogRelPath: action.changelogRelPath,
    candidateLabel: action.label,
    summaryRows: [...state.summaryRows, { candidateId: action.candidateId, meanScore: action.meanScore }],
    globalPhase: 'iteration summary',
  };
  next = pushActivity(
    next,
    `Results ${action.label}: mean ${meanStr} · best ${
      action.bestCandidateId >= 0
        ? `candidate-${action.bestCandidateId} (${action.bestMeanScore >= 0 ? action.bestMeanScore.toFixed(2) : 'n/a'})`
        : 'none yet'
    }${action.isBest ? ' · ** new best **' : ''}`,
  );
  return next;
}

function reducePromotionReport(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'PROMOTION_REPORT' }>,
): RunnerState {
  const s = action.summary;
  const nSkill = s.skillsAdded.length + s.skillsModified.length + s.skillsDeleted.length;
  let next: RunnerState = {
    ...state,
    promotionReportRelPath: action.reportPath,
    promotionSummary: action.summary,
  };
  next = pushActivity(
    next,
    `Promotion report: ${action.reportPath} · skill paths ${nSkill}, rubric ${s.rubricWeightsChanged ? 'changed' : 'unchanged'}, new tests ${s.testCasesAdded.length}`,
  );
  return next;
}

function reduceComplete(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'COMPLETE' }>,
): RunnerState {
  let next: RunnerState = {
    ...state,
    finished: true,
    globalPhase: 'complete',
    finalBestId: action.bestCandidateId,
    finalBestMean: action.bestMeanScore,
    historyRelPath: action.historyRelPath,
    promotionReportRelPath: action.promotionReportRelPath ?? state.promotionReportRelPath,
  };
  next = pushActivity(
    next,
    `Done · ${
      action.bestCandidateId >= 0
        ? `best candidate-${action.bestCandidateId} mean=${action.bestMeanScore >= 0 ? action.bestMeanScore.toFixed(2) : 'n/a'}`
        : 'no scored candidate'
    } · history ${action.historyRelPath}/`,
  );
  return next;
}

function reduceSkippedTest(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'SKIPPED_TEST' }>,
): RunnerState {
  const guess = path.basename(action.filePath, '.json');
  const rows = state.testRows.map((r) =>
    r.name === guess
      ? {
          ...r,
          status: 'skipped' as const,
          skipReason: action.message,
          liveLine: 'invalid JSON',
          phase: null,
          startedAtMs: null,
          lastHeartbeatSec: null,
        }
      : r,
  );
  const phase =
    state.quitRequested || state.finished ? state.globalPhase : globalPhaseAfterTestWork(rows);
  let next = { ...state, testRows: rows, globalPhase: phase };
  next = pushActivity(next, `skip invalid ${guess}: ${action.message.slice(0, LIVE_LINE_ERROR_MAX)}`);
  return next;
}

function reduceIncubateStart(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'INCUBATE_START' }>,
): RunnerState {
  const rows = state.testRows.map((r) =>
    r.name === action.testName
      ? { ...r, liveLine: `incubate: requesting ${action.hypothesisCount} hypotheses…` }
      : r,
  );
  return { ...state, testRows: rows };
}

function reduceIncubateDone(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'INCUBATE_DONE' }>,
): RunnerState {
  const rows = state.testRows.map((r) =>
    r.name === action.testName
      ? {
          ...r,
          liveLine: `incubate ✓ ${action.hypothesisNames.length} hypotheses (${action.hypothesisNames.slice(0, 2).join(', ')}${action.hypothesisNames.length > 2 ? '…' : ''})`,
        }
      : r,
  );
  let next = { ...state, testRows: rows };
  next = pushActivity(next, `${action.testName}: incubate done (${action.hypothesisNames.length} hypotheses)`);
  return next;
}

function reduceHypothesisEvalStart(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'HYPOTHESIS_EVAL_START' }>,
): RunnerState {
  const rows = state.testRows.map((r) =>
    r.name === action.testName ? { ...r, liveLine: `rubric: ${action.hypothesisName}…` } : r,
  );
  return { ...state, testRows: rows };
}

function reduceHypothesisEvalDone(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'HYPOTHESIS_EVAL_DONE' }>,
): RunnerState {
  const rows = state.testRows.map((r) =>
    r.name === action.testName
      ? { ...r, liveLine: `rubric: ${action.hypothesisName}=${action.score.toFixed(2)}` }
      : r,
  );
  let next = { ...state, testRows: rows };
  next = pushActivity(
    next,
    `${action.testName}: ${action.hypothesisName} rubric mean=${action.score.toFixed(2)}`,
  );
  return next;
}

function reduceHypothesisPicked(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'HYPOTHESIS_PICKED' }>,
): RunnerState {
  const rows = state.testRows.map((r) =>
    r.name === action.testName ? { ...r, liveLine: `picked: ${action.hypothesisName}` } : r,
  );
  let next = { ...state, testRows: rows };
  next = pushActivity(next, `${action.testName}: random pick → ${action.hypothesisName}`);
  return next;
}

function reduceInputsGenerateStart(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'INPUTS_GENERATE_START' }>,
): RunnerState {
  const rows = state.testRows.map((r) =>
    r.name === action.testName
      ? { ...r, liveLine: `inputs-gen: ${action.target}…` }
      : r,
  );
  return { ...state, testRows: rows };
}

function reduceInputsGenerateDone(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'INPUTS_GENERATE_DONE' }>,
): RunnerState {
  const rows = state.testRows.map((r) =>
    r.name === action.testName
      ? { ...r, liveLine: `inputs-gen ✓ ${action.target} (${action.charCount} chars)` }
      : r,
  );
  return { ...state, testRows: rows };
}

function reduceInputsRubricDone(
  state: RunnerState,
  action: Extract<RunnerAction, { type: 'INPUTS_RUBRIC_DONE' }>,
): RunnerState {
  const rows = state.testRows.map((r) =>
    r.name === action.testName
      ? { ...r, liveLine: `inputs rubric: ${action.target}=${action.mean.toFixed(2)}` }
      : r,
  );
  let next = { ...state, testRows: rows };
  next = pushActivity(
    next,
    `${action.testName}: inputs ${action.target} rubric mean=${action.mean.toFixed(2)}`,
  );
  return next;
}

export function reduceRunnerState(state: RunnerState, action: RunnerAction): RunnerState {
  switch (action.type) {
    case 'PREFLIGHT':
      return reducePreflight(state, action);
    case 'BASELINE_START':
      return reduceBaselineStart(state);
    case 'ITERATION_START':
      return reduceIterationStart(state, action);
    case 'PROPOSER_START':
      return reduceProposerStart(state, action);
    case 'PROPOSER_TOOL':
      return reduceProposerTool(state, action);
    case 'PROPOSER_DONE':
      return reduceProposerDone(state, action);
    case 'TEST_START':
      return reduceTestStart(state, action);
    case 'HEARTBEAT':
      return reduceHeartbeat(state, action);
    case 'WIRE':
      return reduceWire(state, action);
    case 'TEST_DONE':
      return reduceTestDone(state, action);
    case 'ITERATION_DONE':
      return reduceIterationDone(state, action);
    case 'PROMOTION_REPORT':
      return reducePromotionReport(state, action);
    case 'COMPLETE':
      return reduceComplete(state, action);
    case 'TOGGLE_DETAIL':
      return { ...state, showDetail: !state.showDetail };
    case 'QUIT_REQUESTED':
      return { ...state, quitRequested: true, globalPhase: 'stopping after current step…' };
    case 'SET_ERROR':
      return { ...state, error: action.message, finished: true };
    case 'SET_GLOBAL_PHASE':
      return { ...state, globalPhase: action.phase };
    case 'SKIPPED_TEST':
      return reduceSkippedTest(state, action);
    case 'INCUBATE_START':
      return reduceIncubateStart(state, action);
    case 'INCUBATE_DONE':
      return reduceIncubateDone(state, action);
    case 'HYPOTHESIS_EVAL_START':
      return reduceHypothesisEvalStart(state, action);
    case 'HYPOTHESIS_EVAL_DONE':
      return reduceHypothesisEvalDone(state, action);
    case 'HYPOTHESIS_PICKED':
      return reduceHypothesisPicked(state, action);
    case 'INPUTS_GENERATE_START':
      return reduceInputsGenerateStart(state, action);
    case 'INPUTS_GENERATE_DONE':
      return reduceInputsGenerateDone(state, action);
    case 'INPUTS_RUBRIC_DONE':
      return reduceInputsRubricDone(state, action);
    default:
      return state;
  }
}
