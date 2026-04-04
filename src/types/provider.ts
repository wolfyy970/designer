import type { GenerationStatus } from '../constants/generation';
import type {
  AgenticCheckpoint,
  AggregatedEvaluationReport,
  AgenticPhase,
  EvaluationRoundSnapshot,
  EvaluatorRubricId,
  EvaluatorWorkerReport,
} from './evaluation';

export type { EvaluationContextPayload } from './evaluation';

export type { GenerationStatus };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ProviderModel {
  id: string;
  name: string;
  contextLength?: number;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
}

export interface ProviderOptions {
  model?: string;
  supportsVision?: boolean;
  /** When set, provider fetch is aborted; in-flight LLM log row is failed as Aborted. */
  signal?: AbortSignal;
  /**
   * Server: selects completion margin when deriving `max_tokens` from context − prompt.
   * @see server/lib/completion-budget.ts
   */
  completionPurpose?: 'compile' | 'compaction' | 'agent_turn' | 'default';
}

export interface Provenance {
  hypothesisSnapshot: {
    name: string;
    hypothesis: string;
    rationale: string;
    dimensionValues: Record<string, string>;
  };
  designSystemSnapshot?: string;
  compiledPrompt: string;
  provider: string;
  model: string;
  timestamp: string;
  /** Agentic evaluator harness: persisted when evaluation completed */
  evaluation?: {
    rounds: EvaluationRoundSnapshot[];
    finalAggregate: AggregatedEvaluationReport;
  };
  /** Lightweight run checkpoint for observability and future continuation */
  checkpoint?: AgenticCheckpoint;
}

export interface TodoItem {
  id: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export type RunTraceKind =
  | 'run_started'
  | 'phase'
  | 'model_turn_start'
  | 'model_first_token'
  | 'tool_started'
  | 'tool_finished'
  | 'tool_failed'
  | 'files_planned'
  | 'file_written'
  | 'evaluation_progress'
  | 'evaluation_worker'
  | 'evaluation_report'
  | 'revision_round'
  | 'checkpoint'
  | 'compaction'
  | 'skills_loaded'
  | 'skill_activated';

export interface RunTraceEvent {
  id: string;
  at: string;
  kind: RunTraceKind;
  label: string;
  /** PI model turn index (1-based), set on `model_turn_start` for timeline grouping */
  turnId?: number;
  phase?: AgenticPhase;
  round?: number;
  toolName?: string;
  path?: string;
  status?: 'info' | 'success' | 'warning' | 'error';
  /** Extra context (e.g. evaluator worker failure message) for observability UI */
  detail?: string;
}

/** One PI model turn's streamed reasoning (collapsible timeline). */
export interface ThinkingTurnSlice {
  turnId: number;
  text: string;
  startedAt: number;
  endedAt?: number;
}

/** Transient UI fields for generation liveness (footer, idle detection). In-memory only. */
export interface LivenessSlice {
  progressMessage?: string;
  lastAgentFileAt?: number;
  lastActivityAt?: number;
  lastTraceAt?: number;
  activeToolName?: string;
  activeToolPath?: string;
  streamingToolName?: string;
  streamingToolPath?: string;
  streamingToolChars?: number;
  agenticPhase?: AgenticPhase;
  evaluationStatus?: string;
  /** startedAt of the most recent open thinking turn (endedAt == null), if any. */
  activeThinkingStartedAt?: number;
}

export function pickLivenessSlice(result: GenerationResult): LivenessSlice {
  const turns = result.thinkingTurns;
  let openTurn: ThinkingTurnSlice | undefined;
  if (turns) {
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].endedAt == null) { openTurn = turns[i]; break; }
    }
  }
  return {
    progressMessage: result.progressMessage,
    lastAgentFileAt: result.lastAgentFileAt,
    lastActivityAt: result.lastActivityAt,
    lastTraceAt: result.lastTraceAt,
    activeToolName: result.activeToolName,
    activeToolPath: result.activeToolPath,
    streamingToolName: result.streamingToolName,
    streamingToolPath: result.streamingToolPath,
    streamingToolChars: result.streamingToolChars,
    agenticPhase: result.agenticPhase,
    evaluationStatus: result.evaluationStatus,
    activeThinkingStartedAt: openTurn?.startedAt,
  };
}

export type StreamingToolLiveness = Pick<
  LivenessSlice,
  'streamingToolName' | 'streamingToolPath' | 'streamingToolChars'
>;

export function pickStreamingToolLiveness(result: GenerationResult): StreamingToolLiveness {
  return {
    streamingToolName: result.streamingToolName,
    streamingToolPath: result.streamingToolPath,
    streamingToolChars: result.streamingToolChars,
  };
}

export interface GenerationResult {
  id: string;
  variantStrategyId: string;
  providerId: string;
  status: GenerationStatus;
  code?: string;
  /** In-memory only — live preview during agentic generation. Never persisted. */
  liveCode?: string;
  /** In-memory only — live file map during agentic generation. Never persisted. */
  liveFiles?: Record<string, string>;
  /** In-memory only — files the agent declared it will create. Never persisted. */
  liveFilesPlan?: string[];
  /** In-memory only — current agent task list. Never persisted. */
  liveTodos?: TodoItem[];
  error?: string;
  runId: string;
  runNumber: number;
  metadata: {
    model: string;
    tokensUsed?: number;
    durationMs?: number;
    completedAt?: string;
    truncated?: boolean;
  };
  progressMessage?: string;
  /** Unix ms when `onFile` last ran — for "no new file" stall hints */
  lastAgentFileAt?: number;
  /** Unix ms when model stream last advanced: answer tokens, code chunks, or thinking deltas (batched). */
  lastActivityAt?: number;
  /** Unix ms when the latest structured trace event arrived. */
  lastTraceAt?: number;
  /** Active tool name/path inferred from structured run traces. */
  activeToolName?: string;
  activeToolPath?: string;
  /** In-memory only — Pi is streaming a tool-call before execution (toolcall_*). */
  streamingToolName?: string;
  /** In-memory only — virtual path from partial tool arguments when available. */
  streamingToolPath?: string;
  /** In-memory only — accumulated size of streamed tool-call arguments. */
  streamingToolChars?: number;
  activityLog?: string[];
  /** Assistant text output per PI turn (for timeline). In-memory only. */
  activityByTurn?: Record<number, string>;
  /** Streamed reasoning per turn; in-memory only. */
  thinkingTurns?: ThinkingTurnSlice[];
  /** Capped structured trace for this in-flight run. Never persisted. */
  liveTrace?: RunTraceEvent[];
  /** Agent skills pre-seeded for this Pi session (non-manual catalog). Never persisted. */
  liveSkills?: { key: string; name: string; description: string }[];
  /** Skills the agent activated via use_skill this run. Never persisted. */
  liveActivatedSkills?: { key: string; name: string; description: string }[];
  /** Agentic harness: high-level phase for UI */
  agenticPhase?: AgenticPhase;
  /** Live evaluation progress label during SSE */
  evaluationStatus?: string;
  /** Latest aggregate report while evaluating / after complete */
  evaluationSummary?: AggregatedEvaluationReport;
  /** Full rounds (typically 1–2) after run completes */
  evaluationRounds?: EvaluationRoundSnapshot[];
  /** In-memory only — per-rubric reports as workers finish during SSE. Never persisted. */
  liveEvalWorkers?: Partial<Record<EvaluatorRubricId, EvaluatorWorkerReport>>;
}

/**
 * OpenRouter (OpenAI-compatible) `usage` plus normalized fields for logging.
 * @see https://openrouter.ai/docs/api/reference/overview — ResponseUsage
 */
export interface ChatResponseMetadata {
  /** Completion tokens only (legacy name; same as completionTokens when set). */
  tokensUsed?: number;
  truncated?: boolean;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** OpenRouter usage.completion_tokens_details.reasoning_tokens */
  reasoningTokens?: number;
  /** OpenRouter usage.prompt_tokens_details.cached_tokens */
  cachedPromptTokens?: number;
  /** OpenRouter usage.cost (credits) */
  costCredits?: number;
}

export interface ChatResponse {
  raw: string;
  metadata?: ChatResponseMetadata;
}

export interface GenerationProvider {
  id: string;
  name: string;
  description: string;
  supportsImages: boolean;
  supportsParallel: boolean;
  generateChat(messages: ChatMessage[], options: ProviderOptions): Promise<ChatResponse>;
  /**
   * OpenAI-compatible token streaming; accumulated raw assistant text matches {@link generateChat}’s `raw`.
   * When omitted, callers fall back to {@link generateChat} and emit one delta at the end.
   */
  generateChatStream?(
    messages: ChatMessage[],
    options: ProviderOptions,
    onDelta: (accumulatedRaw: string) => void | Promise<void>,
  ): Promise<ChatResponse>;
  listModels(): Promise<ProviderModel[]>;
  isAvailable(): boolean;
}
