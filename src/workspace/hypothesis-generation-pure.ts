/**
 * Store-free hypothesis generation context (server- and client-safe).
 * No Zustand, no Vite env, no IndexedDB.
 */
import { NODE_TYPES } from '../constants/canvas';
import { getDesignSystemNodeData, getModelNodeData } from '../lib/canvas-node-data';
import type { VariantStrategy } from '../types/compiler';
import type { EvaluationContextPayload } from '../types/evaluation';
import type { ProvenanceContext } from '../types/provenance-context';
import type { DesignSpec, ReferenceImage } from '../types/spec';
import type {
  DomainDesignSystemContent,
  DomainHypothesis,
  DomainModelProfile,
  ThinkingLevel,
} from '../types/workspace-domain';
import type { WorkspaceSnapshotWire } from '../lib/workspace-snapshot-schema';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import {
  LOCKDOWN_MODEL_ID,
  LOCKDOWN_PROVIDER_ID,
} from '../lib/lockdown-model';

export interface WorkspaceGraphSnapshot {
  readonly nodes: readonly WorkspaceNode[];
  readonly edges: readonly WorkspaceEdge[];
}

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high'] as const satisfies readonly ThinkingLevel[];

function isThinkingLevel(x: unknown): x is ThinkingLevel {
  return typeof x === 'string' && (THINKING_LEVELS as readonly string[]).includes(x);
}

/**
 * Ensures every model profile value matches the hypothesis API Zod schema.
 * Stale persisted rows or partial merges can leave `providerId` / `modelId` as undefined; the server
 * validates the full `modelProfiles` record, not only lanes used by the hypothesis.
 */
export function normalizeModelProfilesForApi(
  profiles: Record<string, DomainModelProfile>,
  defaultCompilerProvider: string,
  lockdown = false,
): Record<string, DomainModelProfile> {
  const out: Record<string, DomainModelProfile> = {};
  for (const [nodeId, raw] of Object.entries(profiles)) {
    if (!raw || typeof raw !== 'object') continue;
    let providerId =
      typeof raw.providerId === 'string' && raw.providerId.trim() !== ''
        ? raw.providerId
        : defaultCompilerProvider;
    let modelId = typeof raw.modelId === 'string' ? raw.modelId : '';
    if (lockdown) {
      providerId = LOCKDOWN_PROVIDER_ID;
      modelId = LOCKDOWN_MODEL_ID;
    }
    const entry: DomainModelProfile = {
      nodeId: typeof raw.nodeId === 'string' && raw.nodeId ? raw.nodeId : nodeId,
      providerId,
      modelId,
    };
    if (typeof raw.title === 'string' && raw.title) entry.title = raw.title;
    if (isThinkingLevel(raw.thinkingLevel)) entry.thinkingLevel = raw.thinkingLevel;
    out[nodeId] = entry;
  }
  return out;
}

/**
 * Single choke point: validated wire snapshot uses unknown[] nodes/edges; runtime graph code
 * still treats them as WorkspaceNode/WorkspaceEdge (same as historical casts on the route).
 */
export function workspaceSnapshotWireToGraph(snapshot: WorkspaceSnapshotWire): WorkspaceGraphSnapshot {
  return {
    nodes: snapshot.nodes as WorkspaceNode[],
    edges: snapshot.edges as WorkspaceEdge[],
  };
}

export interface ModelCredential {
  readonly providerId: string;
  readonly modelId: string;
  readonly thinkingLevel: ThinkingLevel;
}

export interface HypothesisGenerationContext {
  readonly hypothesisNodeId: string;
  readonly variantStrategy: VariantStrategy;
  readonly spec: DesignSpec;
  readonly agentMode: 'single' | 'agentic';
  readonly modelCredentials: readonly ModelCredential[];
  readonly designSystemContent: string | undefined;
  readonly designSystemImages: readonly ReferenceImage[];
}

function nodeById(
  snapshot: WorkspaceGraphSnapshot,
  id: string,
): WorkspaceNode | undefined {
  return snapshot.nodes.find((n) => n.id === id);
}

/**
 * Model nodes wired upstream of the hypothesis (graph fallback).
 */
export function listIncomingModelCredentialsFromGraph(
  targetNodeId: string,
  snapshot: WorkspaceGraphSnapshot,
  defaultCompilerProvider: string,
): ModelCredential[] {
  const out: ModelCredential[] = [];
  for (const e of snapshot.edges) {
    if (e.target !== targetNodeId) continue;
    const src = nodeById(snapshot, e.source);
    if (!src || src.type !== NODE_TYPES.MODEL) continue;
    const md = getModelNodeData(src);
    if (!md?.modelId) continue;
    const providerId = md.providerId || defaultCompilerProvider;
    const thinkingLevel = (isThinkingLevel(md.thinkingLevel) ? md.thinkingLevel : undefined) ?? 'minimal';
    out.push({ providerId, modelId: md.modelId, thinkingLevel });
  }
  return out;
}

function collectDesignSystemFromDomain(
  hypothesis: DomainHypothesis | undefined,
  designSystems: Record<string, DomainDesignSystemContent>,
): { content: string | undefined; images: ReferenceImage[] } {
  if (!hypothesis) return { content: undefined, images: [] };
  const parts: string[] = [];
  const images: ReferenceImage[] = [];
  for (const dsId of hypothesis.designSystemNodeIds) {
    const ds = designSystems[dsId];
    if (!ds) continue;
    const c = ds.content || '';
    const t = ds.title || 'Design System';
    if (c.trim()) parts.push(`## ${t}\n${c}`);
    images.push(...(ds.images ?? []));
  }
  return {
    content: parts.join('\n\n---\n\n') || undefined,
    images,
  };
}

function collectDesignSystemFromGraph(
  snapshot: WorkspaceGraphSnapshot,
  targetNodeId: string,
): { content: string | undefined; images: ReferenceImage[] } {
  const incomingEdges = snapshot.edges.filter((e) => e.target === targetNodeId);
  const dsNodes = incomingEdges
    .map((e) => snapshot.nodes.find((n) => n.id === e.source && n.type === NODE_TYPES.DESIGN_SYSTEM))
    .filter(Boolean) as WorkspaceNode[];

  if (dsNodes.length === 0) return { content: undefined, images: [] };

  const parts = dsNodes
    .map((n) => {
      const data = getDesignSystemNodeData(n);
      const t = data?.title || 'Design System';
      const c = data?.content || '';
      return c.trim() ? `## ${t}\n${c}` : '';
    })
    .filter(Boolean);

  return {
    content: parts.join('\n\n---\n\n') || undefined,
    images: dsNodes.flatMap((n) => getDesignSystemNodeData(n)?.images ?? []),
  };
}

function listModelCredentialsFromDomain(
  hypothesis: DomainHypothesis | undefined,
  modelProfiles: Record<string, DomainModelProfile>,
  defaultCompilerProvider: string,
): ModelCredential[] {
  if (!hypothesis) return [];
  const out: ModelCredential[] = [];
  for (const mid of hypothesis.modelNodeIds) {
    const p = modelProfiles[mid];
    if (!p?.modelId) continue;
    out.push({
      providerId: p.providerId || defaultCompilerProvider,
      modelId: p.modelId,
      thinkingLevel: p.thinkingLevel ?? 'minimal',
    });
  }
  return out;
}

export function buildHypothesisGenerationContextFromInputs(input: {
  hypothesisNodeId: string;
  variantStrategy: VariantStrategy;
  spec: DesignSpec;
  snapshot: WorkspaceGraphSnapshot;
  domainHypothesis?: DomainHypothesis | null;
  modelProfiles: Record<string, DomainModelProfile>;
  designSystems: Record<string, DomainDesignSystemContent>;
  defaultCompilerProvider: string;
}): HypothesisGenerationContext | null {
  const { hypothesisNodeId, variantStrategy, spec, snapshot, domainHypothesis } = input;

  let modelCredentials = listModelCredentialsFromDomain(
    domainHypothesis ?? undefined,
    input.modelProfiles,
    input.defaultCompilerProvider,
  );
  if (modelCredentials.length === 0) {
    modelCredentials = listIncomingModelCredentialsFromGraph(
      hypothesisNodeId,
      snapshot,
      input.defaultCompilerProvider,
    );
  }
  if (modelCredentials.length === 0) return null;

  const node = nodeById(snapshot, hypothesisNodeId);
  const agentMode =
    domainHypothesis?.agentMode ??
    ((node?.data?.agentMode as 'single' | 'agentic' | undefined) ?? 'single');

  let designSystemContent: string | undefined;
  let designSystemImages: readonly ReferenceImage[] = [];
  if (domainHypothesis && domainHypothesis.designSystemNodeIds.length > 0) {
    const ds = collectDesignSystemFromDomain(domainHypothesis, input.designSystems);
    designSystemContent = ds.content;
    designSystemImages = ds.images;
  } else {
    const g = collectDesignSystemFromGraph(snapshot, hypothesisNodeId);
    designSystemContent = g.content;
    designSystemImages = g.images;
  }

  return {
    hypothesisNodeId,
    variantStrategy,
    spec,
    agentMode,
    modelCredentials,
    designSystemContent,
    designSystemImages,
  };
}

export function provenanceFromHypothesisContext(
  ctx: HypothesisGenerationContext,
): ProvenanceContext {
  const s = ctx.variantStrategy;
  return {
    strategies: {
      [s.id]: {
        name: s.name,
        hypothesis: s.hypothesis,
        rationale: s.rationale,
        dimensionValues: s.dimensionValues,
      },
    },
    designSystemSnapshot: ctx.designSystemContent || undefined,
  };
}

export function evaluationPayloadFromHypothesisContext(
  ctx: HypothesisGenerationContext,
): EvaluationContextPayload | undefined {
  if (ctx.agentMode !== 'agentic') return undefined;
  const s = ctx.variantStrategy;
  const dv = s.dimensionValues;
  const outputFormat =
    dv['format'] ?? dv['output_format'] ?? dv['Output format'] ?? dv['Output Format'];

  return {
    strategyName: s.name,
    hypothesis: s.hypothesis,
    rationale: s.rationale,
    measurements: s.measurements,
    dimensionValues: s.dimensionValues,
    objectivesMetrics: ctx.spec.sections['objectives-metrics']?.content,
    designConstraints: ctx.spec.sections['design-constraints']?.content,
    designSystemSnapshot: ctx.designSystemContent || undefined,
    ...(outputFormat ? { outputFormat: String(outputFormat).trim() } : {}),
  };
}
