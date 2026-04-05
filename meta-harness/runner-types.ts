/**
 * Callback contracts for runMetaHarnessEngine (shared by TUI, plain, and candidate evaluation).
 */
import type { MetaHarnessMode } from './modes.ts';
import type { MetaHarnessConfig } from './schemas.ts';
import type { PromotionSummary } from './promotion-report.ts';

export type RunnerPreflightInfo = {
  cfg: MetaHarnessConfig;
  mode: MetaHarnessMode;
  iterations: number;
  testCaseNames: string[];
  evalRunsBase: string;
  evalOnly: boolean;
  testFilters: string[];
  /** When true, candidate-0 baseline eval runs before the first proposer iteration (see § baseline in docs). */
  baselineWillRun: boolean;
};

export type RunnerCallbacks = {
  onPreflight: (info: RunnerPreflightInfo) => void;
  /** Fired once before candidate-0 baseline eval (no proposer). */
  onBaselineStart?: () => void;
  onIterationStart: (candidateId: number, iteration: number, total: number) => void;
  onProposerStart: (model: string, maxRounds: number) => void;
  onProposerToolCall: (round: number, toolName: string, summary: string) => void;
  onProposerDone: (
    elapsedMs: number,
    overrides: string[],
    reasoning: string,
    roundsUsed: number,
    maxRounds: number,
  ) => void;
  onTestCaseStart: (index: number, total: number, name: string) => void;
  onWireEvent: (testName: string, event: string, payload: unknown) => void;
  /** Every ~3s while compile stream is idle or during non-streaming rubric calls. */
  onTestCaseHeartbeat?: (testName: string, elapsedSec: number) => void;
  onTestCaseDone: (
    name: string,
    score: number | null,
    stopReason: string | null,
    elapsedMs: number,
    error?: string,
    /** Explicit outcome; when omitted, UI may infer from `error` / `score`. */
    outcome?: 'scored' | 'unscored' | 'error',
  ) => void;
  onSkippedTestCase?: (filePath: string, message: string) => void;
  onIterationDone: (info: {
    candidateId: number;
    meanScore: number | null;
    isBest: boolean;
    bestCandidateId: number;
    bestMeanScore: number;
    changelogRelPath: string;
    label: string;
    iteration: number;
    totalIterations: number;
  }) => void;
  onPromotionReport?: (reportRelPath: string, summary: PromotionSummary) => void;
  onComplete: (
    bestCandidateId: number,
    bestMeanScore: number,
    historyRelPath: string,
    promotionReportRelPath?: string,
  ) => void;
  shouldStop?: () => boolean;
  onCompileStart?: (testName: string, hypothesisCount: number) => void;
  onCompileDone?: (testName: string, hypotheses: { name: string; id: string }[]) => void;
  onHypothesisEvalStart?: (testName: string, hypothesisName: string) => void;
  onHypothesisEvalDone?: (testName: string, hypothesisName: string, score: number) => void;
  onHypothesisPicked?: (testName: string, hypothesisName: string) => void;
};
