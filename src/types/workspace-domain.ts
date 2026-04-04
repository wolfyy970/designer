/**
 * Domain-first workspace model (client).
 * Canvas nodes/edges are a projection; semantic relations live here.
 */
import type { ReferenceImage } from './spec';

export type AgentMode = 'single' | 'agentic';
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high';

/** Wired inputs for compile: section + variant node ids feeding an incubator. */
export interface DomainIncubatorWiring {
  readonly sectionNodeIds: string[];
  readonly variantNodeIds: string[];
}

/** Hypothesis runtime settings and bindings (not graph topology). */
export interface DomainHypothesis {
  id: string;
  incubatorId: string;
  variantStrategyId: string;
  modelNodeIds: string[];
  designSystemNodeIds: string[];
  /** Direct vs agentic — one setting for all lanes on this hypothesis. */
  agentMode?: AgentMode;
  placeholder: boolean;
}

export interface DomainModelProfile {
  readonly nodeId: string;
  providerId: string;
  modelId: string;
  title?: string;
  /** Reasoning depth for this model when generating. */
  thinkingLevel?: ThinkingLevel;
}

export interface DomainDesignSystemContent {
  readonly nodeId: string;
  title: string;
  content: string;
  images: ReferenceImage[];
  providerMigration?: string;
  modelMigration?: string;
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
  variantSlots: Record<string, DomainVariantSlot>;
}

export function defaultIncubatorWiring(): DomainIncubatorWiring {
  return { sectionNodeIds: [], variantNodeIds: [] };
}

/** Slot key used in variantSlots map */
export function variantSlotKey(hypothesisId: string, variantStrategyId: string): string {
  return `${hypothesisId}::${variantStrategyId}`;
}
