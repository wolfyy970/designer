import type { DesignSpec, ReferenceImage } from '../types/spec';
import type { CompiledPrompt, DimensionMap, VariantStrategy } from '../types/compiler';
import type { DomainDesignSystemContent, DomainHypothesis, DomainModelProfile } from '../types/workspace-domain';
import type { ProvenanceContext } from '../types/provenance-context';
import type { ProviderModel, RunTraceEvent, TodoItem } from '../types/provider';
import type {
  AgenticCheckpoint,
  AgenticPhase,
  EvaluationContextPayload,
  EvaluationRoundSnapshot,
} from '../types/evaluation';
import type { WorkspaceSnapshotWire } from '../lib/workspace-snapshot-schema';

// ── Compile ─────────────────────────────────────────────────────────

export interface CompileRequest {
  spec: DesignSpec;
  providerId: string;
  modelId: string;
  referenceDesigns?: { name: string; code: string }[];
  critiques?: CritiqueInput[];
  supportsVision?: boolean;
  promptOptions?: {
    count?: number;
    existingStrategies?: VariantStrategy[];
  };
}

export interface CritiqueInput {
  title: string;
  strengths: string;
  improvements: string;
  direction: string;
  variantCode?: string;
}

export type CompileResponse = DimensionMap;

// ── Generate ────────────────────────────────────────────────────────

export interface GenerateRequest {
  prompt: string;
  images?: ReferenceImage[];
  providerId: string;
  modelId: string;
  supportsVision?: boolean;
  mode?: 'single' | 'agentic';
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  evaluationContext?: EvaluationContextPayload;
  /** Optional separate provider/model for LLM evaluators; defaults to builder's when unset */
  evaluatorProviderId?: string;
  evaluatorModelId?: string;
  /** Override server default max PI revision rounds (0–20). */
  agenticMaxRevisionRounds?: number;
  /** Optional early satisfaction when overall score ≥ this and no hard fails. */
  agenticMinOverallScore?: number;
}

/** Workspace slice sent to `/api/hypothesis/*` (mirrors client domain + graph). */
export interface HypothesisWorkspaceApiPayload {
  hypothesisNodeId: string;
  variantStrategy: VariantStrategy;
  spec: DesignSpec;
  snapshot: WorkspaceSnapshotWire;
  domainHypothesis: DomainHypothesis | null;
  modelProfiles: Record<string, DomainModelProfile>;
  designSystems: Record<string, DomainDesignSystemContent>;
  defaultCompilerProvider: string;
}

export interface HypothesisPromptBundleResponse {
  prompts: CompiledPrompt[];
  evaluationContext: EvaluationContextPayload | null;
  provenance: ProvenanceContext;
  generationContext: {
    agentMode: 'single' | 'agentic';
    thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
    modelCredentials: { providerId: string; modelId: string }[];
  };
}

export interface HypothesisGenerateApiPayload extends HypothesisWorkspaceApiPayload {
  supportsVision?: boolean;
  evaluatorProviderId?: string;
  evaluatorModelId?: string;
  agenticMaxRevisionRounds?: number;
  agenticMinOverallScore?: number;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
}

export type GenerateSSEEvent =
  | { type: 'progress'; status: string }
  | { type: 'activity'; entry: string }
  | { type: 'trace'; trace: RunTraceEvent }
  | { type: 'code'; code: string }
  | { type: 'error'; error: string }
  | { type: 'file'; path: string; content: string }
  | { type: 'plan'; files: string[] }
  | { type: 'todos'; todos: TodoItem[] }
  | { type: 'phase'; phase: AgenticPhase }
  | { type: 'evaluation_progress'; round: number; phase: string; message?: string }
  | { type: 'evaluation_report'; round: number; snapshot: EvaluationRoundSnapshot }
  | { type: 'revision_round'; round: number; brief: string }
  | { type: 'checkpoint'; checkpoint: AgenticCheckpoint }
  | { type: 'lane_done'; laneIndex: number }
  | { type: 'done' };

// ── Models ──────────────────────────────────────────────────────────

export type ModelsResponse = ProviderModel[];

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
}

// ── Logs ────────────────────────────────────────────────────────────

export interface LlmLogEntry {
  id: string;
  timestamp: string;
  source:
    | 'compiler'
    | 'planner'
    | 'builder'
    | 'designSystem'
    | 'evaluator'
    | 'agentCompaction'
    | 'other';
  phase?: string;
  model: string;
  provider: string;
  /** Display name when known (e.g. OpenRouter) */
  providerName?: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedPromptTokens?: number;
  costCredits?: number;
  truncated?: boolean;
  toolCalls?: { name: string; path?: string }[];
  error?: string;
}

// ── Design System ───────────────────────────────────────────────────

export interface DesignSystemExtractRequest {
  images: ReferenceImage[];
  providerId: string;
  modelId: string;
}

export interface DesignSystemExtractResponse {
  result: string;
}
