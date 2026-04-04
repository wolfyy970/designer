import type {
  AgentMode,
  DomainDesignSystemContent,
  DomainHypothesis,
  DomainIncubatorWiring,
  DomainModelProfile,
  DomainPreviewSlot,
} from '../types/workspace-domain';
import type { CanvasNodeType } from '../types/workspace-graph';

export interface WorkspaceDomainStore {
  incubatorWirings: Record<string, DomainIncubatorWiring>;
  incubatorModelNodeIds: Record<string, string[]>;
  hypotheses: Record<string, DomainHypothesis>;
  modelProfiles: Record<string, DomainModelProfile>;
  designSystems: Record<string, DomainDesignSystemContent>;
  previewSlots: Record<string, DomainPreviewSlot>;

  ensureIncubatorWiring: (incubatorId: string) => void;
  attachModelToTarget: (modelNodeId: string, targetId: string, targetType: CanvasNodeType) => void;
  detachModelFromTarget: (
    modelNodeId: string,
    targetId: string,
    targetType: CanvasNodeType,
  ) => void;
  attachIncubatorInput: (
    incubatorId: string,
    sourceId: string,
    sourceType: CanvasNodeType,
  ) => void;
  detachIncubatorInput: (
    incubatorId: string,
    sourceId: string,
    sourceType: CanvasNodeType,
  ) => void;
  attachDesignSystemToHypothesis: (dsNodeId: string, hypothesisId: string) => void;
  detachDesignSystemFromHypothesis: (dsNodeId: string, hypothesisId: string) => void;
  linkHypothesisToIncubator: (
    hypothesisId: string,
    incubatorId: string,
    strategyId: string,
  ) => void;
  setHypothesisGenerationSettings: (
    hypothesisId: string,
    partial: { agentMode?: AgentMode | undefined },
  ) => void;
  setHypothesisPlaceholder: (hypothesisId: string, placeholder: boolean) => void;
  removeHypothesis: (hypothesisId: string) => void;
  removeIncubator: (incubatorId: string) => void;

  upsertModelProfile: (nodeId: string, partial: Partial<DomainModelProfile>) => void;
  removeModelProfile: (nodeId: string) => void;
  purgeModelNode: (modelNodeId: string) => void;
  upsertDesignSystem: (nodeId: string, partial: Partial<DomainDesignSystemContent>) => void;
  removeDesignSystem: (nodeId: string) => void;

  setPreviewSlot: (
    hypothesisId: string,
    strategyId: string,
    partial: Partial<DomainPreviewSlot>,
  ) => void;
  removePreviewSlot: (hypothesisId: string, strategyId: string) => void;

  reset: () => void;
}
