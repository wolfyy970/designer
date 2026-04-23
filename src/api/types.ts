import type { DesignSpec, ReferenceImage } from '../types/spec';
import type { CompiledPrompt, IncubationPlan, HypothesisStrategy } from '../types/incubator';
import type {
  DomainDesignSystemContent,
  DomainHypothesis,
  DomainModelProfile,
} from '../types/workspace-domain';
import type { ProvenanceContext } from '../types/provenance-context';
import type { ProviderModel } from '../types/provider';
import type { EvaluationContextPayload } from '../types/evaluation';
import type { WorkspaceSnapshotWire } from '../lib/workspace-snapshot-schema';
import type { ThinkingOverride } from '../lib/thinking-defaults';

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
  /** Optional per-request thinking override; server merges with task defaults + capability gate. */
  thinking?: ThinkingOverride;
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
}

export interface HypothesisPromptBundleResponse {
  prompts: CompiledPrompt[];
  evaluationContext: EvaluationContextPayload | null;
  provenance: ProvenanceContext;
  generationContext: {
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

// ── Design System ───────────────────────────────────────────────────

export interface DesignSystemExtractRequest {
  images: ReferenceImage[];
  providerId: string;
  modelId: string;
  thinking?: ThinkingOverride;
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
  thinking?: ThinkingOverride;
}

export interface InputsGenerateResponse {
  result: string;
}
