import type { DesignSpec, ReferenceImage } from '../types/spec';
import type { CompiledPrompt, IncubationPlan, HypothesisStrategy } from '../types/incubator';
import type {
  DomainDesignSystemContent,
  DomainHypothesis,
  DomainModelProfile,
  DesignMdLintSummary,
} from '../types/workspace-domain';
import type { ProvenanceContext } from '../types/provenance-context';
import type { ProviderModel } from '../types/provider';
import type { EvaluationContextPayload } from '../types/evaluation';
import type { WorkspaceSnapshotWire } from '../lib/workspace-snapshot-schema';
import type {
  AppConfigResponse,
  DesignSystemExtractWireResponse,
  HypothesisPromptBundleWireResponse,
  IncubateWireResponse,
  InputsGenerateWireResponse,
  InternalContextGenerateWireResponse,
  ModelsWireResponse,
  ProvidersListWireResponse,
} from './wire-schemas';
import type {
  DesignSystemExtractRequestWire,
  IncubateRequestWire,
  InputsGenerateRequestWire,
  InternalContextGenerateRequestWire,
} from './request-schemas';

// ── Incubate (spec → incubation plan) ────────────────────────────────

export type IncubateRequest = IncubateRequestWire & {
  spec: DesignSpec;
  promptOptions?: IncubateRequestWire['promptOptions'] & {
    existingStrategies?: HypothesisStrategy[];
  };
};

export type IncubateResponse = IncubateWireResponse & IncubationPlan;

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

export type HypothesisPromptBundleResponse = HypothesisPromptBundleWireResponse & {
  prompts: CompiledPrompt[];
  evaluationContext: EvaluationContextPayload | null;
  provenance: ProvenanceContext;
};

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

export type ModelsResponse = ModelsWireResponse & ProviderModel[];

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
}

export type ProvidersListResponse = ProvidersListWireResponse & ProviderInfo[];

// ── Design System ───────────────────────────────────────────────────

export type DesignSystemExtractRequest = DesignSystemExtractRequestWire & {
  images?: ReferenceImage[];
};

export type DesignSystemExtractResponse = DesignSystemExtractWireResponse & {
  lint?: DesignMdLintSummary;
};

// ── Spec inputs auto-generate (magic wand) ──────────────────────────

export type InputsGenerateTargetApiId = InputsGenerateRequestWire['inputId'];
export type InputsGenerateRequest = InputsGenerateRequestWire;

export type InputsGenerateResponse = InputsGenerateWireResponse;

// ── Internal context document (spec inputs → derived Markdown) ──────

export type InternalContextGenerateRequest = InternalContextGenerateRequestWire & {
  spec: DesignSpec;
};

export type InternalContextGenerateResponse = InternalContextGenerateWireResponse;
export type { AppConfigResponse };
