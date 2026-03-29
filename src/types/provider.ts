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
  activityLog?: string[];
  /** Agentic harness: high-level phase for UI */
  agenticPhase?: AgenticPhase;
  /** Live evaluation progress label during SSE */
  evaluationStatus?: string;
  /** Latest aggregate report while evaluating / after complete */
  evaluationSummary?: AggregatedEvaluationReport;
  /** Full rounds (typically 1–2) after run completes */
  evaluationRounds?: EvaluationRoundSnapshot[];
}

export interface ChatResponse {
  raw: string;
  metadata?: {
    tokensUsed?: number;
    truncated?: boolean;
  };
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
