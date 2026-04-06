/**
 * Domain-first workspace model (client).
 * Canvas nodes/edges are a projection; semantic relations live here.
 */
import type { ReferenceImage } from './spec';

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high';

/** Wired inputs for incubate: input + preview node ids feeding an incubator. */
export interface DomainIncubatorWiring {
  readonly inputNodeIds: string[];
  readonly previewNodeIds: string[];
}

/** Hypothesis runtime settings and bindings (not graph topology). */
export interface DomainHypothesis {
  id: string;
  incubatorId: string;
  strategyId: string;
  modelNodeIds: string[];
  designSystemNodeIds: string[];
  /** When true, run evaluator-driven revision after the initial build + eval. Default false = one pass (no Pi revision loop). */
  revisionEnabled?: boolean;
  /** Per-hypothesis max revision rounds; undefined = use Settings evaluator defaults. */
  maxRevisionRounds?: number;
  /**
   * Per-hypothesis target overall score (0–5); undefined = use Settings default; null = no score target.
   */
  minOverallScore?: number | null;
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

/** Preview slot per hypothesis + strategy (canvas node id is projection). */
export interface DomainPreviewSlot {
  readonly hypothesisId: string;
  readonly strategyId: string;
  previewNodeId: string | null;
  activeResultId: string | null;
  pinnedRunId: string | null;
}

export interface WorkspaceDomainStateV1 {
  schemaVersion: 1;
  incubatorWirings: Record<string, DomainIncubatorWiring>;
  /** Model nodes feeding the incubator (incubate / connected-model for IncubatorNode). */
  incubatorModelNodeIds: Record<string, string[]>;
  hypotheses: Record<string, DomainHypothesis>;
  modelProfiles: Record<string, DomainModelProfile>;
  designSystems: Record<string, DomainDesignSystemContent>;
  previewSlots: Record<string, DomainPreviewSlot>;
}

export function defaultIncubatorWiring(): DomainIncubatorWiring {
  return { inputNodeIds: [], previewNodeIds: [] };
}

/** Slot key used in previewSlots map */
export function previewSlotKey(hypothesisId: string, strategyId: string): string {
  return `${hypothesisId}::${strategyId}`;
}
