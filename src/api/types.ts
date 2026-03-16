import type { DesignSpec, ReferenceImage } from '../types/spec';
import type { DimensionMap, VariantStrategy } from '../types/compiler';
import type { ProviderModel } from '../types/provider';

// ── Compile ─────────────────────────────────────────────────────────

export interface CompileRequest {
  spec: DesignSpec;
  providerId: string;
  modelId: string;
  promptOverrides?: {
    compilerSystem?: string;
    compilerUser?: string;
  };
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
  promptOverrides?: {
    genSystemHtml?: string;
    genSystemHtmlAgentic?: string;
    variant?: string;
  };
  supportsVision?: boolean;
  mode?: 'single' | 'agentic';
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
}

export type GenerateSSEEvent =
  | { type: 'progress'; status: string }
  | { type: 'activity'; entry: string }
  | { type: 'code'; code: string }
  | { type: 'error'; error: string }
  | { type: 'file'; path: string; content: string }
  | { type: 'plan'; files: string[] }
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
  promptOverrides?: {
    designSystemExtract?: string;
  };
}

export interface DesignSystemExtractResponse {
  result: string;
}
