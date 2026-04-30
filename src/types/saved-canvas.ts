import { z } from 'zod';
import type { DesignSpec } from './spec';
import { DesignSpecSchema, ReferenceImageSchema } from './spec';
import { DesignSystemMarkdownSourceSchema } from './design-system-source';
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

const JsonRecordSchema = z.record(z.string(), z.unknown());

const WorkspaceViewportSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  })
  .strict();

const WorkspaceNodeSchema = z
  .object({
    id: z.string(),
    type: z.enum([
      'designBrief',
      'researchContext',
      'objectivesMetrics',
      'designConstraints',
      'inputGhost',
      'designSystem',
      'incubator',
      'hypothesis',
      'preview',
      'model',
    ]),
    position: z
      .object({
        x: z.number(),
        y: z.number(),
      })
      .strict(),
    data: JsonRecordSchema,
    measured: z
      .object({
        width: z.number().optional(),
        height: z.number().optional(),
      })
      .strict()
      .optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })
  .passthrough();

const WorkspaceEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    type: z.string(),
    data: z
      .object({
        status: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

const IncubatorWiringSchema = z
  .object({
    inputNodeIds: z.array(z.string()),
    previewNodeIds: z.array(z.string()),
    designSystemNodeIds: z.array(z.string()),
  })
  .strict();

const HypothesisSchema = z
  .object({
    id: z.string(),
    incubatorId: z.string(),
    strategyId: z.string(),
    modelNodeIds: z.array(z.string()),
    designSystemNodeIds: z.array(z.string()),
    revisionEnabled: z.boolean().optional(),
    maxRevisionRounds: z.number().optional(),
    minOverallScore: z.number().nullable().optional(),
    placeholder: z.boolean(),
  })
  .passthrough();

const ModelProfileSchema = z
  .object({
    nodeId: z.string(),
    providerId: z.string(),
    modelId: z.string(),
    title: z.string().optional(),
    thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
  })
  .passthrough();

const DesignMdDocumentSchema = z
  .object({
    content: z.string(),
    sourceHash: z.string(),
    generatedAt: z.string(),
    providerId: z.string(),
    modelId: z.string(),
    lint: JsonRecordSchema.optional(),
    error: z.string().optional(),
  })
  .passthrough();

const DesignSystemContentSchema = z
  .object({
    nodeId: z.string(),
    title: z.string(),
    content: z.string(),
    images: z.array(ReferenceImageSchema),
    markdownSources: z.array(DesignSystemMarkdownSourceSchema).optional(),
    designMdDocument: DesignMdDocumentSchema.optional(),
    providerMigration: z.string().optional(),
    modelMigration: z.string().optional(),
  })
  .passthrough();

const PreviewSlotSchema = z
  .object({
    hypothesisId: z.string(),
    strategyId: z.string(),
    previewNodeId: z.string().nullable(),
    activeResultId: z.string().nullable(),
    pinnedRunId: z.string().nullable(),
  })
  .strict();

const GenerationResultSnapshotSchema = z
  .object({
    id: z.string(),
    strategyId: z.string(),
    providerId: z.string(),
    status: z.string(),
    code: z.string().optional(),
    error: z.string().optional(),
    runId: z.string(),
    runNumber: z.number(),
    metadata: JsonRecordSchema,
  })
  .passthrough();

const SavedCanvasArtifactBundleSchema = z
  .object({
    code: z.string().optional(),
    files: z.record(z.string(), z.string()).optional(),
    provenance: JsonRecordSchema.optional(),
    roundFiles: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  })
  .strict();

export const SavedCanvasSnapshotSchema = z
  .object({
    schemaVersion: z.literal(SAVED_CANVAS_SNAPSHOT_VERSION),
    savedAt: z.string(),
    spec: DesignSpecSchema,
    canvas: z
      .object({
        nodes: z.array(WorkspaceNodeSchema),
        edges: z.array(WorkspaceEdgeSchema),
        viewport: WorkspaceViewportSchema,
        showMiniMap: z.boolean(),
        colGap: z.number(),
      })
      .strict(),
    workspaceDomain: z
      .object({
        incubatorWirings: z.record(z.string(), IncubatorWiringSchema),
        incubatorModelNodeIds: z.record(z.string(), z.array(z.string())),
        hypotheses: z.record(z.string(), HypothesisSchema),
        modelProfiles: z.record(z.string(), ModelProfileSchema),
        designSystems: z.record(z.string(), DesignSystemContentSchema),
        previewSlots: z.record(z.string(), PreviewSlotSchema),
      })
      .strict(),
    incubator: z
      .object({
        incubationPlans: z.record(z.string(), JsonRecordSchema),
        compiledPrompts: z.array(JsonRecordSchema),
        selectedProvider: z.string(),
        selectedModel: z.string(),
      })
      .strict(),
    generation: z
      .object({
        results: z.array(GenerationResultSnapshotSchema),
        selectedVersions: z.record(z.string(), z.string()),
        userBestOverrides: z.record(z.string(), z.string()),
      })
      .strict(),
    artifacts: z.record(z.string(), SavedCanvasArtifactBundleSchema),
  })
  .strict() as unknown as z.ZodType<SavedCanvasSnapshot>;

export const SavedCanvasExportBundleSchema = z
  .object({
    kind: z.literal('designer.canvas'),
    snapshot: SavedCanvasSnapshotSchema,
  })
  .strict() as unknown as z.ZodType<SavedCanvasExportBundle>;
