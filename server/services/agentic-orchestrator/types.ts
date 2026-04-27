import type {
  AgenticCheckpoint,
  AgenticPhase,
  AggregatedEvaluationReport,
  EvaluationContextPayload,
  EvaluationRoundSnapshot,
  EvaluatorRubricId,
  EvaluatorWorkerReport,
} from '../../../src/types/evaluation.ts';
import type { LoadedSkillSummary } from '../../lib/skill-schema.ts';
import type { AgentRunEvent, AgentSessionParams } from '../pi-agent-run-types.ts';

export type AgenticOrchestratorBuildInput = Omit<AgentSessionParams, 'systemPrompt'>;

export { MAX_REVISION_ROUNDS_CAP } from '../../lib/evaluation-revision-gate.ts';

/** Max design-finding summaries folded into checkpoint todos line. */
export const CHECKPOINT_TODO_SUMMARY_MAX = 5;

export type AgenticOrchestratorEvent =
  | AgentRunEvent
  | { type: 'phase'; phase: AgenticPhase }
  | { type: 'skills_loaded'; skills: LoadedSkillSummary[] }
  | { type: 'evaluation_progress'; round: number; phase: string; message?: string }
  | {
      type: 'evaluation_worker_done';
      round: number;
      rubric: EvaluatorRubricId;
      report: EvaluatorWorkerReport;
    }
  | { type: 'evaluation_report'; round: number; snapshot: EvaluationRoundSnapshot }
  | { type: 'revision_round'; round: number; brief: string };

export interface AgenticOrchestratorOptions {
  build: AgenticOrchestratorBuildInput;
  compiledPrompt: string;
  /** `null` = skip evaluation and revision (single Pi build only). `undefined` = run eval (legacy /api/generate). */
  evaluationContext?: EvaluationContextPayload | null;
  /** Override provider/model for LLM evaluators; defaults to build provider/model */
  evaluatorProviderId?: string;
  evaluatorModelId?: string;
  /** Max PI revision sessions after the first evaluation (not counting initial build). */
  maxRevisionRounds: number;
  /** Optional early exit when overall score is high enough and there are no hard fails. */
  minOverallScore?: number;
  /** Optional blend for overall score; merged with product defaults and normalized server-side. */
  rubricWeights?: Partial<Record<EvaluatorRubricId, number>>;
  /** Session type for skill filtering. Defaults to 'design'. */
  sessionType?: import('../../lib/skill-discovery.ts').SessionType;
  /**
   * When set, SSE delivery failures abort this controller (same instance the orchestrator wires to
   * `onDeliveryFailure`). Lets callers align their own writers with `AbortSignal.any([upstream, signal])`.
   */
  streamFailureController?: AbortController;
  onStream: (e: AgenticOrchestratorEvent) => void | Promise<void>;
}

export interface AgenticOrchestratorResult {
  files: Record<string, string>;
  rounds: EvaluationRoundSnapshot[];
  finalAggregate: AggregatedEvaluationReport;
  checkpoint: AgenticCheckpoint;
  /** Paths that already received live `file` SSE during Pi sessions (build + revisions). */
  emittedFilePaths: string[];
}
