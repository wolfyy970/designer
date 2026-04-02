import type { GenerationStatus } from '../constants/generation';
import type {
  AgenticCheckpoint,
  AggregatedEvaluationReport,
  AgenticPhase,
  EvaluationRoundSnapshot,
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
  | 'evaluation_report'
  | 'revision_round'
  | 'checkpoint'
  | 'compaction';

export interface RunTraceEvent {
  id: string;
  at: string;
  kind: RunTraceKind;
  label: string;
  phase?: AgenticPhase;
  round?: number;
  toolName?: string;
  path?: string;
  status?: 'info' | 'success' | 'warning' | 'error';
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
  /** Unix ms when streamed model text last arrived. */
  lastActivityAt?: number;
  /** Unix ms when the latest structured trace event arrived. */
  lastTraceAt?: number;
  /** Active tool name/path inferred from structured run traces. */
  activeToolName?: string;
  activeToolPath?: string;
  activityLog?: string[];
  /** Capped structured trace for this in-flight run. Never persisted. */
  liveTrace?: RunTraceEvent[];
  /** Agentic harness: high-level phase for UI */
  agenticPhase?: AgenticPhase;
  /** Live evaluation progress label during SSE */
  evaluationStatus?: string;
  /** Latest aggregate report while evaluating / after complete */
  evaluationSummary?: AggregatedEvaluationReport;
  /** Full rounds (typically 1–2) after run completes */
  evaluationRounds?: EvaluationRoundSnapshot[];
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
  listModels(): Promise<ProviderModel[]>;
  isAvailable(): boolean;
}
