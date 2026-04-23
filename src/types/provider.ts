import type { GenerationStatus } from '../constants/generation';
import type { RunTraceEvent, RunTraceKind } from '../lib/run-trace-event-schema';
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
export type { RunTraceEvent, RunTraceKind };

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
  completionPurpose?: 'incubate' | 'compaction' | 'agent_turn' | 'default';
  /**
   * Server: resolved reasoning config for this call (level + token budget).
   * Obtain via `resolveThinkingConfig(task, modelId, override?)` — providers
   * forward this to their OpenRouter / OpenAI-compatible reasoning fields.
   * @see src/lib/thinking-defaults.ts, src/lib/provider-thinking-params.ts
   */
  thinking?: import('../lib/thinking-defaults').ThinkingConfig;
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

/** Skill catalog entry or activation payload (SSE skills_loaded / skill_activated). */
export interface SkillInfo {
  key: string;
  name: string;
  description: string;
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
  streamedModelChars?: number;
  agenticPhase?: AgenticPhase;
  evaluationStatus?: string;
  /** startedAt of the most recent open thinking turn (endedAt == null), if any. */
  activeThinkingStartedAt?: number;
}

/** Copied from {@link GenerationResult} into {@link LivenessSlice} (excludes computed `activeThinkingStartedAt`). */
const LIVENESS_SLICE_KEYS = [
  'progressMessage',
  'lastAgentFileAt',
  'lastActivityAt',
  'lastTraceAt',
  'activeToolName',
  'activeToolPath',
  'streamingToolName',
  'streamingToolPath',
  'streamingToolChars',
  'streamedModelChars',
  'agenticPhase',
  'evaluationStatus',
] as const satisfies readonly (keyof Omit<LivenessSlice, 'activeThinkingStartedAt'>)[];

export function pickLivenessSlice(result: GenerationResult): LivenessSlice {
  const turns = result.thinkingTurns;
  let openTurn: ThinkingTurnSlice | undefined;
  if (turns) {
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].endedAt == null) { openTurn = turns[i]; break; }
    }
  }
  const base = Object.fromEntries(LIVENESS_SLICE_KEYS.map((k) => [k, result[k]])) as Pick<
    LivenessSlice,
    (typeof LIVENESS_SLICE_KEYS)[number]
  >;
  return {
    ...base,
    activeThinkingStartedAt: openTurn?.startedAt,
  };
}

export type StreamingToolLiveness = Pick<
  LivenessSlice,
  'streamingToolName' | 'streamingToolPath' | 'streamingToolChars'
>;

const STREAMING_TOOL_LIVENESS_KEYS = [
  'streamingToolName',
  'streamingToolPath',
  'streamingToolChars',
] as const satisfies readonly (keyof StreamingToolLiveness)[];

export function pickStreamingToolLiveness(result: GenerationResult): StreamingToolLiveness {
  return Object.fromEntries(
    STREAMING_TOOL_LIVENESS_KEYS.map((k) => [k, result[k]]),
  ) as StreamingToolLiveness;
}

export interface GenerationResult {
  id: string;
  strategyId: string;
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
  /**
   * Cumulative characters the model has streamed during the run (answer + thinking).
   * Drives the live `~N tok` indicator in the preview-node generating state.
   * In-memory only; stripped by generation-store `partialize`.
   */
  streamedModelChars?: number;
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
  /** Agent skills in the catalog for this Pi session (non-manual). Never persisted. */
  liveSkills?: SkillInfo[];
  /** Skills the agent activated via use_skill this run. Never persisted. */
  liveActivatedSkills?: SkillInfo[];
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
