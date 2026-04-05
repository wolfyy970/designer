import path from 'node:path';
import type { PromotionSummary, RunnerPreflightInfo } from '../runner-core.ts';
import type { MetaHarnessMode } from '../modes.ts';
import { wireDetailSnippet, wirePayloadLine } from './wire-formatters.ts';

export type TestRowStatus = 'pending' | 'running' | 'done' | 'unscored' | 'error' | 'skipped';

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

export type ProposerState = {
  phase: 'idle' | 'running' | 'done';
  model: string;
  maxRounds: number;
  currentRound: number;
  currentTool: string;
  toolLog: Array<{ round: number; tool: string; summary: string }>;
  doneElapsedMs: number | null;
  overrides: string[];
  reasoningPreview: string;
};

export type ActivityItem = { id: number; text: string; atMs: number };

export type SummaryRow = { candidateId: number; meanScore: number | null };

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
    overrides: [],
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
    bestCandidateId: -1,
    bestMeanScore: -1,
    newBestThisIteration: false,
    runningMean: null,
    completedTests: 0,
    activityItems: [],
    showDetail: false,
    finished: false,
    quitRequested: false,
    summaryRows: [],
    historyRelPath: '',
    finalBestId: -1,
    finalBestMean: -1,
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

function appendDetail(row: TestRowState, line: string, max = 14): TestRowState {
  const next = [...row.detailLines, line];
  return { ...row, detailLines: next.slice(-max) };
}

export type RunnerAction =
  | { type: 'PREFLIGHT'; payload: RunnerPreflightInfo }
  | { type: 'BASELINE_START' }
  | { type: 'ITERATION_START'; candidateId: number; iteration: number; total: number }
  | { type: 'PROPOSER_START'; model: string; maxRounds: number }
  | { type: 'PROPOSER_TOOL'; round: number; toolName: string; summary: string }
  | { type: 'PROPOSER_DONE'; elapsedMs: number; overrides: string[]; reasoning: string; roundsUsed: number; maxRounds: number }
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
  | { type: 'COMPILE_START'; testName: string; hypothesisCount: number }
  | { type: 'COMPILE_DONE'; testName: string; hypothesisNames: string[] }
  | { type: 'HYPOTHESIS_EVAL_START'; testName: string; hypothesisName: string }
  | { type: 'HYPOTHESIS_EVAL_DONE'; testName: string; hypothesisName: string; score: number }
  | { type: 'HYPOTHESIS_PICKED'; testName: string; hypothesisName: string };

export function reduceRunnerState(state: RunnerState, action: RunnerAction): RunnerState {
  switch (action.type) {
    case 'PREFLIGHT': {
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
    case 'BASELINE_START': {
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
    case 'ITERATION_START': {
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
    case 'PROPOSER_START': {
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
    case 'PROPOSER_TOOL': {
      const entry = { round: action.round, tool: action.toolName, summary: action.summary };
      const log = [...state.proposer.toolLog, entry].slice(-12);
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
    case 'PROPOSER_DONE': {
      const ms = action.elapsedMs;
      const prev = `${(ms / 1000).toFixed(1)}s`;
      let next: RunnerState = {
        ...state,
        globalPhase: 'evaluating',
        proposer: {
          ...state.proposer,
          phase: 'done' as const,
          doneElapsedMs: ms,
          overrides: action.overrides,
          reasoningPreview: action.reasoning.slice(0, 120) + (action.reasoning.length > 120 ? '…' : ''),
        },
      };
      next = pushActivity(
        next,
        `Proposer done (${prev}, ${action.roundsUsed}/${action.maxRounds} rounds)${action.overrides.length ? ` · overrides: ${action.overrides.join(', ')}` : ''}`,
      );
      return next;
    }
    case 'TEST_START': {
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
    case 'HEARTBEAT': {
      const rows = state.testRows.map((r) =>
        r.name === action.testName
          ? { ...r, lastHeartbeatSec: action.elapsedSec }
          : r,
      );
      return { ...state, testRows: rows };
    }
    case 'WIRE': {
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
    case 'TEST_DONE': {
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
            liveLine: (action.error ?? 'error').slice(0, 80),
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
        activityLine = `ERROR ${action.name}: ${(action.error ?? 'unknown').slice(0, 100)}`;
      } else if (inferredOutcome === 'unscored') {
        activityLine = `${action.name} finished (${elapsed}) no score · stop=${action.stopReason ?? '?'}`;
      } else {
        activityLine = `${action.name} done (${elapsed}) score=${scoreStr} stop=${action.stopReason ?? '?'}`;
      }
      next = pushActivity(next, activityLine);
      return next;
    }
    case 'ITERATION_DONE': {
      const meanStr = action.meanScore != null ? action.meanScore.toFixed(2) : 'n/a';
      let next: RunnerState = {
        ...state,
        bestCandidateId: action.bestCandidateId,
        bestMeanScore: action.bestMeanScore,
        newBestThisIteration: action.isBest,
        changelogRelPath: action.changelogRelPath,
        candidateLabel: action.label,
        summaryRows: [
          ...state.summaryRows,
          { candidateId: action.candidateId, meanScore: action.meanScore },
        ],
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
    case 'PROMOTION_REPORT': {
      const s = action.summary;
      const nSkill = s.skillsAdded.length + s.skillsModified.length + s.skillsDeleted.length;
      let next: RunnerState = {
        ...state,
        promotionReportRelPath: action.reportPath,
        promotionSummary: action.summary,
      };
      next = pushActivity(
        next,
        `Promotion report: ${action.reportPath} · prompts ${s.promptOverrideKeys.length}, skill paths ${nSkill}, new tests ${s.testCasesAdded.length}`,
      );
      return next;
    }
    case 'COMPLETE': {
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
    case 'TOGGLE_DETAIL':
      return { ...state, showDetail: !state.showDetail };
    case 'QUIT_REQUESTED':
      return { ...state, quitRequested: true, globalPhase: 'stopping after current step…' };
    case 'SET_ERROR':
      return { ...state, error: action.message, finished: true };
    case 'SET_GLOBAL_PHASE':
      return { ...state, globalPhase: action.phase };
    case 'SKIPPED_TEST': {
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
      next = pushActivity(next, `skip invalid ${guess}: ${action.message.slice(0, 80)}`);
      return next;
    }
    case 'COMPILE_START': {
      const rows = state.testRows.map((r) =>
        r.name === action.testName
          ? { ...r, liveLine: `compile: requesting ${action.hypothesisCount} hypotheses…` }
          : r,
      );
      return { ...state, testRows: rows };
    }
    case 'COMPILE_DONE': {
      const rows = state.testRows.map((r) =>
        r.name === action.testName
          ? {
              ...r,
              liveLine: `compile ✓ ${action.hypothesisNames.length} hypotheses (${action.hypothesisNames.slice(0, 2).join(', ')}${action.hypothesisNames.length > 2 ? '…' : ''})`,
            }
          : r,
      );
      let next = { ...state, testRows: rows };
      next = pushActivity(
        next,
        `${action.testName}: compile done (${action.hypothesisNames.length} hypotheses)`,
      );
      return next;
    }
    case 'HYPOTHESIS_EVAL_START': {
      const rows = state.testRows.map((r) =>
        r.name === action.testName
          ? { ...r, liveLine: `rubric: ${action.hypothesisName}…` }
          : r,
      );
      return { ...state, testRows: rows };
    }
    case 'HYPOTHESIS_EVAL_DONE': {
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
    case 'HYPOTHESIS_PICKED': {
      const rows = state.testRows.map((r) =>
        r.name === action.testName
          ? { ...r, liveLine: `picked: ${action.hypothesisName}` }
          : r,
      );
      let next = { ...state, testRows: rows };
      next = pushActivity(next, `${action.testName}: random pick → ${action.hypothesisName}`);
      return next;
    }
    default:
      return state;
  }
}
