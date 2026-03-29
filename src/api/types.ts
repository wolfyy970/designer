import type { DesignSpec, ReferenceImage } from '../types/spec';
import type { DimensionMap, VariantStrategy } from '../types/compiler';
import type { ProviderModel, TodoItem } from '../types/provider';
import type {
  AgenticCheckpoint,
  AgenticPhase,
  EvaluationContextPayload,
  EvaluationRoundSnapshot,
} from '../types/evaluation';

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

export type GenerateSSEEvent =
  | { type: 'progress'; status: string }
  | { type: 'activity'; entry: string }
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
  source: 'compiler' | 'generator' | 'other';
  phase?: string;
  model: string;
  provider: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  durationMs: number;
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
