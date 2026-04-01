/**
 * Domain-first workspace model (client).
 * Canvas nodes/edges are a projection; semantic relations live here.
 */
import type { ReferenceImage } from './spec';

export type AgentMode = 'single' | 'agentic';
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high';

/** Wired inputs for compile: section + variant + critique node ids feeding an incubator. */
export interface DomainIncubatorWiring {
  readonly sectionNodeIds: string[];
  readonly variantNodeIds: string[];
  readonly critiqueNodeIds: string[];
}

/** Hypothesis runtime settings and bindings (not graph topology). */
export interface DomainHypothesis {
  id: string;
  incubatorId: string;
  variantStrategyId: string;
  modelNodeIds: string[];
  designSystemNodeIds: string[];
  agentMode: AgentMode;
  /** Omitted on wire when unset (same meaning as `undefined`). */
  thinkingLevel?: ThinkingLevel;
  placeholder: boolean;
}

export interface DomainModelProfile {
  readonly nodeId: string;
  providerId: string;
  modelId: string;
  title?: string;
}

export interface DomainDesignSystemContent {
  readonly nodeId: string;
  title: string;
  content: string;
  images: ReferenceImage[];
  providerMigration?: string;
  modelMigration?: string;
}

export interface DomainCritiqueContent {
  readonly nodeId: string;
  title: string;
  strengths: string;
  improvements: string;
  direction: string;
}

/** Variant preview slot per hypothesis + strategy (canvas node id is projection). */
export interface DomainVariantSlot {
  readonly hypothesisId: string;
  readonly variantStrategyId: string;
  variantNodeId: string | null;
  activeResultId: string | null;
  pinnedRunId: string | null;
}

export interface WorkspaceDomainStateV1 {
  schemaVersion: 1;
  incubatorWirings: Record<string, DomainIncubatorWiring>;
  /** Model nodes feeding the incubator (compile / connected-model for CompilerNode). */
  incubatorModelNodeIds: Record<string, string[]>;
  hypotheses: Record<string, DomainHypothesis>;
  modelProfiles: Record<string, DomainModelProfile>;
  designSystems: Record<string, DomainDesignSystemContent>;
  critiques: Record<string, DomainCritiqueContent>;
  variantSlots: Record<string, DomainVariantSlot>;
}

export function defaultIncubatorWiring(): DomainIncubatorWiring {
  return { sectionNodeIds: [], variantNodeIds: [], critiqueNodeIds: [] };
}

/** Slot key used in variantSlots map */
export function variantSlotKey(hypothesisId: string, variantStrategyId: string): string {
  return `${hypothesisId}::${variantStrategyId}`;
}
