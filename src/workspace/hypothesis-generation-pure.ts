/**
 * Store-free hypothesis generation context (server- and client-safe).
 * No Zustand, no Vite env, no IndexedDB.
 */
import { getDesignSystemNodeData } from '../lib/canvas-node-data';
import type { Dimension, HypothesisStrategy } from '../types/incubator';
import type { EvaluationContextPayload } from '../types/evaluation';
import type { ProvenanceContext } from '../types/provenance-context';
import type { DesignSpec } from '../types/spec';
import type {
  DomainDesignSystemContent,
  DomainHypothesis,
  ThinkingLevel,
} from '../types/workspace-domain';
import type { DesignSystemSourceMode } from '../types/design-system-mode';
import {
  DEFAULT_DESIGN_SYSTEM_SOURCE_MODE,
  isDesignSystemSourceMode,
} from '../types/design-system-mode';
import { NODE_TYPES } from '../constants/canvas';
import type { WorkspaceSnapshotWire } from '../lib/workspace-snapshot-schema';
import type { WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import type { WorkspaceGraphSnapshot } from './graph-queries.ts';
import { formatDesignSystemSourceMarkdown, type DesignMdSource } from '../lib/design-md-core';

export type { WorkspaceGraphSnapshot };

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
  readonly hypothesisStrategy: HypothesisStrategy;
  readonly dimensions: readonly Dimension[];
  readonly spec: DesignSpec;
  readonly modelCredentials: readonly ModelCredential[];
  readonly designSystemContent: string | undefined;
}

function collectDesignSystemFromDomain(
  hypothesis: DomainHypothesis | undefined,
  designSystems: Record<string, DomainDesignSystemContent>,
): string | undefined {
  if (!hypothesis) return undefined;
  const parts: string[] = [];
  for (const dsId of hypothesis.designSystemNodeIds) {
    const ds = designSystems[dsId];
    if (!ds) continue;
    const source = domainDesignSystemSource(ds);
    if (source.mode === 'none') continue;
    const c = ds.designMdDocument?.content || formatDesignSystemSourceMarkdown(source) || '';
    const t = ds.title || 'Design System';
    if (c.trim()) parts.push(`## ${t}\n${c}`);
  }
  return parts.join('\n\n---\n\n');
}

function getDomainDesignSystemSourceMode(ds: DomainDesignSystemContent): DesignSystemSourceMode {
  if (ds.sourceMode === 'off') return 'none';
  if (ds.sourceMode) return ds.sourceMode;
  return designSystemSourceHasInputLocal(ds) ? 'custom' : DEFAULT_DESIGN_SYSTEM_SOURCE_MODE;
}

function domainDesignSystemSource(ds: DomainDesignSystemContent): DesignMdSource {
  const mode = getDomainDesignSystemSourceMode(ds);
  if (mode === 'none') return emptyDesignSystemSource(ds.title);
  return {
    mode,
    title: ds.title,
    content: ds.content,
    images: ds.images,
    markdownSources: ds.markdownSources,
  };
}

function getNodeDesignSystemSourceMode(data: Record<string, unknown>): DesignSystemSourceMode {
  if (data.sourceMode === 'off') return 'none';
  if (isDesignSystemSourceMode(data.sourceMode)) return data.sourceMode;
  return designSystemSourceHasInputLocal(data) ? 'custom' : DEFAULT_DESIGN_SYSTEM_SOURCE_MODE;
}

function designSystemSourceHasInputLocal(source: {
  content?: unknown;
  images?: unknown;
  markdownSources?: unknown;
}): boolean {
  return (
    (typeof source.content === 'string' && source.content.trim().length > 0) ||
    (Array.isArray(source.images) && source.images.length > 0) ||
    (Array.isArray(source.markdownSources) &&
      source.markdownSources.some(
        (asset) =>
          typeof asset === 'object' &&
          asset !== null &&
          'content' in asset &&
          typeof asset.content === 'string' &&
          asset.content.trim().length > 0,
      ))
  );
}

function emptyDesignSystemSource(title?: string): DesignMdSource {
  return {
    mode: 'none',
    title: title || 'Design System',
    content: '',
    images: [],
    markdownSources: [],
  };
}

function collectDesignSystemFromGraph(
  snapshot: WorkspaceGraphSnapshot,
  targetNodeId: string,
): string | undefined {
  const incomingEdges = snapshot.edges.filter((e) => e.target === targetNodeId);
  const dsNodes = incomingEdges
    .map((e) => snapshot.nodes.find((n) => n.id === e.source && n.type === NODE_TYPES.DESIGN_SYSTEM))
    .filter(Boolean) as WorkspaceNode[];

  if (dsNodes.length === 0) return undefined;

  const parts = dsNodes
    .map((n) => {
      const data = getDesignSystemNodeData(n);
      if (!data) return '';
      const mode = getNodeDesignSystemSourceMode(data);
      if (mode === 'none') return '';
      const source = {
        mode,
        title: data.title,
        content: data.content,
        images: data.images,
        markdownSources: data.markdownSources,
      } satisfies DesignMdSource;
      const t = data?.title || 'Design System';
      const c = data?.designMdDocument?.content || formatDesignSystemSourceMarkdown(source) || '';
      return c.trim() ? `## ${t}\n${c}` : '';
    })
    .filter(Boolean);

  return parts.join('\n\n---\n\n');
}

export function buildHypothesisGenerationContextFromInputs(input: {
  hypothesisNodeId: string;
  hypothesisStrategy: HypothesisStrategy;
  dimensions?: readonly Dimension[];
  spec: DesignSpec;
  snapshot: WorkspaceGraphSnapshot;
  domainHypothesis?: DomainHypothesis | null;
  designSystems: Record<string, DomainDesignSystemContent>;
  /** Settings-store credential — the canonical source post Phase 7 D. */
  settingsCredential: ModelCredential;
}): HypothesisGenerationContext | null {
  const { hypothesisNodeId, hypothesisStrategy, spec, snapshot, domainHypothesis } = input;

  /**
   * Exactly one credential. The canvas used to be able to wire several Model
   * nodes into a hypothesis; Phase 7 D moved model selection into Settings, so
   * a hypothesis now resolves to the single `design` task credential.
   *
   * The array shape is kept because the SSE wire contract is lane-multiplexed
   * (`laneIndex`, `lane_done`) and the server already merges several models for
   * any caller that supplies them. Consequence worth knowing before reading the
   * lane code: `modelCredentials.length` is always 1 in production, so the
   * per-lane loops execute once and the "N of M failed" copy in
   * `hypothesis-generate-flow` cannot currently render. Those paths are covered
   * by tests with synthetic multi-credential input, not by the UI.
   */
  const modelCredentials: ModelCredential[] = [input.settingsCredential];

  let designSystemContent: string | undefined;
  if (domainHypothesis && domainHypothesis.designSystemNodeIds.length > 0) {
    designSystemContent = collectDesignSystemFromDomain(domainHypothesis, input.designSystems);
  } else {
    designSystemContent = collectDesignSystemFromGraph(snapshot, hypothesisNodeId);
  }

  return {
    hypothesisNodeId,
    hypothesisStrategy,
    dimensions: input.dimensions ?? [],
    spec,
    modelCredentials,
    designSystemContent,
  };
}

export function provenanceFromHypothesisContext(
  ctx: HypothesisGenerationContext,
): ProvenanceContext {
  const s = ctx.hypothesisStrategy;
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
): EvaluationContextPayload {
  const s = ctx.hypothesisStrategy;

  return {
    strategyName: s.name,
    hypothesis: s.hypothesis,
    rationale: s.rationale,
    measurements: s.measurements,
    dimensionValues: s.dimensionValues,
    objectivesMetrics: ctx.spec.sections['objectives-metrics']?.content,
    designConstraints: ctx.spec.sections['design-constraints']?.content,
    designSystemSnapshot: ctx.designSystemContent || undefined,
  };
}
