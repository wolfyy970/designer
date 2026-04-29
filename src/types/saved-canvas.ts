import type { DesignSpec } from './spec';
import type { GenerationResult, Provenance } from './provider';
import type { IncubationPlan, CompiledPrompt } from './incubator';
import type { WorkspaceEdge, WorkspaceNode, WorkspaceViewport } from './workspace-graph';
import type {
  DomainDesignSystemContent,
  DomainHypothesis,
  DomainIncubatorWiring,
  DomainModelProfile,
  DomainPreviewSlot,
} from './workspace-domain';

export const SAVED_CANVAS_SNAPSHOT_VERSION = 1;

export interface SavedCanvasArtifactBundle {
  code?: string;
  files?: Record<string, string>;
  provenance?: Provenance;
  roundFiles?: Record<number, Record<string, string>>;
}

export interface SavedCanvasSnapshot {
  schemaVersion: typeof SAVED_CANVAS_SNAPSHOT_VERSION;
  savedAt: string;
  spec: DesignSpec;
  canvas: {
    nodes: WorkspaceNode[];
    edges: WorkspaceEdge[];
    viewport: WorkspaceViewport;
    showMiniMap: boolean;
    colGap: number;
  };
  workspaceDomain: {
    incubatorWirings: Record<string, DomainIncubatorWiring>;
    incubatorModelNodeIds: Record<string, string[]>;
    hypotheses: Record<string, DomainHypothesis>;
    modelProfiles: Record<string, DomainModelProfile>;
    designSystems: Record<string, DomainDesignSystemContent>;
    previewSlots: Record<string, DomainPreviewSlot>;
  };
  incubator: {
    incubationPlans: Record<string, IncubationPlan>;
    compiledPrompts: CompiledPrompt[];
    selectedProvider: string;
    selectedModel: string;
  };
  generation: {
    results: GenerationResult[];
    selectedVersions: Record<string, string>;
    userBestOverrides: Record<string, string>;
  };
  artifacts: Record<string, SavedCanvasArtifactBundle>;
}

export interface SavedCanvasListEntry {
  id: string;
  title: string;
  lastModified: string;
  savedAt: string;
  schemaVersion: typeof SAVED_CANVAS_SNAPSHOT_VERSION;
}

export interface SavedCanvasExportBundle {
  kind: 'designer.canvas';
  snapshot: SavedCanvasSnapshot;
}
