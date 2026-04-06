import type { DesignSpec, ReferenceImage } from '../types/spec';
import type { CompiledPrompt, IncubationPlan, HypothesisStrategy } from '../types/incubator';
import type {
  AgentMode,
  DomainDesignSystemContent,
  DomainHypothesis,
  DomainModelProfile,
} from '../types/workspace-domain';
import type { ProvenanceContext } from '../types/provenance-context';
import type { ProviderModel } from '../types/provider';
import type { EvaluationContextPayload } from '../types/evaluation';
import type { WorkspaceSnapshotWire } from '../lib/workspace-snapshot-schema';

// ── Incubate (spec → incubation plan) ────────────────────────────────

export interface IncubateRequest {
  spec: DesignSpec;
  providerId: string;
  modelId: string;
  referenceDesigns?: { name: string; code: string }[];
  supportsVision?: boolean;
  promptOptions?: {
    count?: number;
    existingStrategies?: HypothesisStrategy[];
  };
  /** Local Prompt Studio drafts — applied only for this request on the server. */
  promptOverrides?: Record<string, string>;
}

export type IncubateResponse = IncubationPlan;

/** Workspace slice sent to `/api/hypothesis/*` (mirrors client domain + graph). */
export interface HypothesisWorkspaceApiPayload {
  hypothesisNodeId: string;
  hypothesisStrategy: HypothesisStrategy;
  spec: DesignSpec;
  snapshot: WorkspaceSnapshotWire;
  domainHypothesis: DomainHypothesis | null;
  modelProfiles: Record<string, DomainModelProfile>;
  designSystems: Record<string, DomainDesignSystemContent>;
  defaultIncubatorProvider: string;
  promptOverrides?: Record<string, string>;
}

export interface HypothesisPromptBundleResponse {
  prompts: CompiledPrompt[];
  evaluationContext: EvaluationContextPayload | null;
  provenance: ProvenanceContext;
  generationContext: {
    /** Hypothesis-level direct vs agentic (all lanes share this mode). */
    agentMode: AgentMode;
    modelCredentials: {
      providerId: string;
      modelId: string;
      thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high';
    }[];
  };
}

export interface HypothesisGenerateApiPayload extends HypothesisWorkspaceApiPayload {
  correlationId?: string;
  supportsVision?: boolean;
  evaluatorProviderId?: string;
  evaluatorModelId?: string;
  agenticMaxRevisionRounds?: number;
  agenticMinOverallScore?: number;
  /** Per-rubric weights (non-negative; server merges with defaults and renormalizes). */
  rubricWeights?: Record<
    'design' | 'strategy' | 'implementation' | 'browser',
    number
  >;
}

export type { GenerateSSEEvent } from '../lib/generate-sse-event-schema';

// ── Models ──────────────────────────────────────────────────────────

export type ModelsResponse = ProviderModel[];

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
}

// ── Logs ────────────────────────────────────────────────────────────

export type LlmLogStatus = 'in_progress' | 'complete' | 'error';

export interface LlmLogEntry {
  id: string;
  timestamp: string;
  status?: LlmLogStatus;
  correlationId?: string;
  source:
    | 'incubator'
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

/** One trace row from GET /api/logs (matches server NDJSON `type: "trace"`). */
export interface ObservabilityTraceRow {
  v: 1;
  ts: string;
  type: 'trace';
  payload: {
    event: Record<string, unknown>;
    correlationId?: string;
    resultId?: string;
  };
}

export interface ObservabilityLogsResponse {
  llm: LlmLogEntry[];
  trace: ObservabilityTraceRow[];
}

// ── Design System ───────────────────────────────────────────────────

export interface DesignSystemExtractRequest {
  images: ReferenceImage[];
  providerId: string;
  modelId: string;
  promptOverrides?: Record<string, string>;
}

export interface DesignSystemExtractResponse {
  result: string;
}

// ── Spec inputs auto-generate (magic wand) ──────────────────────────

export type InputsGenerateTargetApiId =
  | 'research-context'
  | 'objectives-metrics'
  | 'design-constraints';

export interface InputsGenerateRequest {
  inputId: InputsGenerateTargetApiId;
  designBrief: string;
  existingDesign?: string;
  researchContext?: string;
  objectivesMetrics?: string;
  designConstraints?: string;
  providerId: string;
  modelId: string;
  promptOverrides?: Record<string, string>;
}

export interface InputsGenerateResponse {
  result: string;
}
