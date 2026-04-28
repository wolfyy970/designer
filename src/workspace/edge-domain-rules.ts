/**
 * Declarative mapping: canvas edge pairs → workspace domain store mutations.
 * Keeps incremental sync (live graph edits) and bulk hydrate (snapshot load) aligned.
 *
 * @see VALID_CONNECTIONS in `canvas-connections.ts` — domain rules cover the wired workflow pairs.
 */
import { NODE_TYPES, INPUT_NODE_TYPES } from '../constants/canvas';
import {
  getHypothesisNodeData,
} from '../lib/canvas-node-data';
import { getHypothesisRefId, isPlaceholderHypothesis } from '../lib/hypothesis-node-utils';
import type { WorkspaceDomainStore } from '../stores/workspace-domain-store-types';
import type { CanvasNodeType, WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import { findIncubatorForHypothesis, snapshotNodeToWorkspace } from './graph-queries';

/** Snapshot shape for `hydrateDomainFromCanvasGraph`. */
export type HydrateGraphSnapshot = {
  nodes: { id: string; type: CanvasNodeType; data: Record<string, unknown> }[];
  edges: { source: string; target: string }[];
};

export type IncrementalNewEdgeContext = {
  d: WorkspaceDomainStore;
  src: WorkspaceNode;
  tgt: WorkspaceNode;
  nodes: WorkspaceNode[];
  allEdges: WorkspaceEdge[];
};

export type IncrementalRemovedEdgeContext = {
  d: WorkspaceDomainStore;
  src: WorkspaceNode;
  tgt: WorkspaceNode;
};

export type HydrateEdgeContext = {
  store: WorkspaceDomainStore;
  input: HydrateGraphSnapshot;
  src: HydrateGraphSnapshot['nodes'][number];
  tgt: HydrateGraphSnapshot['nodes'][number];
};

export interface IncrementalNewEdgeRule {
  readonly id: string;
  readonly match: (srcType: CanvasNodeType, tgtType: CanvasNodeType) => boolean;
  readonly apply: (ctx: IncrementalNewEdgeContext) => void;
}

export interface IncrementalRemovedEdgeRule {
  readonly id: string;
  readonly match: (srcType: CanvasNodeType, tgtType: CanvasNodeType) => boolean;
  readonly apply: (ctx: IncrementalRemovedEdgeContext) => void;
}

export interface HydrateEdgeRule {
  readonly id: string;
  readonly match: (srcType: CanvasNodeType, tgtType: CanvasNodeType) => boolean;
  readonly apply: (ctx: HydrateEdgeContext) => void;
}

export interface EdgeDomainRule {
  readonly id: string;
  readonly match: (srcType: CanvasNodeType, tgtType: CanvasNodeType) => boolean;
  readonly onAdd?: (ctx: IncrementalNewEdgeContext) => void;
  readonly onRemove?: (ctx: IncrementalRemovedEdgeContext) => void;
  readonly onHydrate?: (ctx: HydrateEdgeContext) => void;
}

/** Order matters: first matching rule wins (same as former if/else chain). */
export const EDGE_DOMAIN_RULES: readonly EdgeDomainRule[] = [
  {
    id: 'model-hypothesis',
    match: (s, t) => s === NODE_TYPES.MODEL && t === NODE_TYPES.HYPOTHESIS,
    onAdd: ({ d, src, tgt, nodes, allEdges }) => {
      const refId = getHypothesisRefId(tgt);
      const inc = findIncubatorForHypothesis({ nodes, edges: allEdges }, tgt.id);
      if (refId && inc) d.linkHypothesisToIncubator(tgt.id, inc, refId);
      d.setHypothesisPlaceholder(tgt.id, isPlaceholderHypothesis(tgt.data));
      d.attachModelToTarget(src.id, tgt.id, NODE_TYPES.HYPOTHESIS);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachModelFromTarget(src.id, tgt.id, NODE_TYPES.HYPOTHESIS);
    },
    onHydrate: ({ store, input, src, tgt }) => {
      store.attachModelToTarget(src.id, tgt.id, NODE_TYPES.HYPOTHESIS);
      const h = getHypothesisNodeData(snapshotNodeToWorkspace(tgt));
      if (h?.refId) {
        const inc = findIncubatorForHypothesis(input, tgt.id);
        if (inc) store.linkHypothesisToIncubator(tgt.id, inc, h.refId);
      }
    },
  },
  {
    id: 'model-compiler',
    match: (s, t) => s === NODE_TYPES.MODEL && t === NODE_TYPES.INCUBATOR,
    onAdd: ({ d, src, tgt }) => {
      d.ensureIncubatorWiring(tgt.id);
      d.attachModelToTarget(src.id, tgt.id, NODE_TYPES.INCUBATOR);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachModelFromTarget(src.id, tgt.id, NODE_TYPES.INCUBATOR);
    },
    onHydrate: ({ store, src, tgt }) => {
      store.ensureIncubatorWiring(tgt.id);
      store.attachModelToTarget(src.id, tgt.id, NODE_TYPES.INCUBATOR);
    },
  },
  {
    id: 'compiler-hypothesis',
    match: (s, t) => s === NODE_TYPES.INCUBATOR && t === NODE_TYPES.HYPOTHESIS,
    onAdd: ({ d, src, tgt }) => {
      const refId = getHypothesisRefId(tgt);
      if (refId) d.linkHypothesisToIncubator(tgt.id, src.id, refId);
      d.setHypothesisPlaceholder(tgt.id, isPlaceholderHypothesis(tgt.data));
    },
    onHydrate: ({ store, src, tgt }) => {
      const h = getHypothesisNodeData(snapshotNodeToWorkspace(tgt));
      if (h?.refId) {
        store.linkHypothesisToIncubator(tgt.id, src.id, h.refId);
      }
      store.setHypothesisPlaceholder(tgt.id, Boolean(h?.placeholder));
    },
  },
  {
    id: 'section-compiler',
    match: (s, t) => INPUT_NODE_TYPES.has(s) && t === NODE_TYPES.INCUBATOR,
    onAdd: ({ d, src, tgt }) => {
      d.ensureIncubatorWiring(tgt.id);
      d.attachIncubatorInput(tgt.id, src.id, src.type);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachIncubatorInput(tgt.id, src.id, src.type);
    },
    onHydrate: ({ store, src, tgt }) => {
      store.ensureIncubatorWiring(tgt.id);
      store.attachIncubatorInput(tgt.id, src.id, src.type);
    },
  },
  {
    id: 'variant-compiler',
    match: (s, t) => s === NODE_TYPES.PREVIEW && t === NODE_TYPES.INCUBATOR,
    onAdd: ({ d, src, tgt }) => {
      d.ensureIncubatorWiring(tgt.id);
      d.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.PREVIEW);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachIncubatorInput(tgt.id, src.id, NODE_TYPES.PREVIEW);
    },
    onHydrate: ({ store, src, tgt }) => {
      store.ensureIncubatorWiring(tgt.id);
      store.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.PREVIEW);
    },
  },
  {
    id: 'designSystem-compiler',
    match: (s, t) => s === NODE_TYPES.DESIGN_SYSTEM && t === NODE_TYPES.INCUBATOR,
    onAdd: ({ d, src, tgt }) => {
      d.ensureIncubatorWiring(tgt.id);
      d.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.DESIGN_SYSTEM);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachIncubatorInput(tgt.id, src.id, NODE_TYPES.DESIGN_SYSTEM);
    },
    onHydrate: ({ store, src, tgt }) => {
      store.ensureIncubatorWiring(tgt.id);
      store.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.DESIGN_SYSTEM);
    },
  },
  {
    id: 'designSystem-hypothesis',
    match: (s, t) => s === NODE_TYPES.DESIGN_SYSTEM && t === NODE_TYPES.HYPOTHESIS,
    onAdd: ({ d, src, tgt, nodes, allEdges }) => {
      d.attachDesignSystemToHypothesis(src.id, tgt.id);
      const refId = getHypothesisRefId(tgt);
      const inc = findIncubatorForHypothesis({ nodes, edges: allEdges }, tgt.id);
      if (refId && inc) d.linkHypothesisToIncubator(tgt.id, inc, refId);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachDesignSystemFromHypothesis(src.id, tgt.id);
    },
    onHydrate: ({ store, input, src, tgt }) => {
      store.attachDesignSystemToHypothesis(src.id, tgt.id);
      const h = getHypothesisNodeData(snapshotNodeToWorkspace(tgt));
      if (h?.refId) {
        const inc = findIncubatorForHypothesis(input, tgt.id);
        if (inc) store.linkHypothesisToIncubator(tgt.id, inc, h.refId);
      }
    },
  },
];

export const INCREMENTAL_NEW_EDGE_RULES: readonly IncrementalNewEdgeRule[] =
  EDGE_DOMAIN_RULES.flatMap((rule) =>
    rule.onAdd ? [{ id: rule.id, match: rule.match, apply: rule.onAdd }] : [],
  );

export function applyIncrementalNewEdgeRules(ctx: IncrementalNewEdgeContext): void {
  for (const rule of INCREMENTAL_NEW_EDGE_RULES) {
    if (rule.match(ctx.src.type, ctx.tgt.type)) {
      rule.apply(ctx);
      return;
    }
  }
}

export const INCREMENTAL_REMOVED_EDGE_RULES: readonly IncrementalRemovedEdgeRule[] =
  EDGE_DOMAIN_RULES.flatMap((rule) =>
    rule.onRemove ? [{ id: rule.id, match: rule.match, apply: rule.onRemove }] : [],
  );

export function applyIncrementalRemovedEdgeRules(ctx: IncrementalRemovedEdgeContext): void {
  for (const rule of INCREMENTAL_REMOVED_EDGE_RULES) {
    if (rule.match(ctx.src.type, ctx.tgt.type)) {
      rule.apply(ctx);
      return;
    }
  }
}

/**
 * Hydrate applies the same semantic bindings as incremental sync, but order differs for some pairs
 * (e.g. model→hypothesis attaches the model before linking incubator) preserved from legacy hydrate.
 */
export const HYDRATE_EDGE_RULES: readonly HydrateEdgeRule[] =
  EDGE_DOMAIN_RULES.flatMap((rule) =>
    rule.onHydrate ? [{ id: rule.id, match: rule.match, apply: rule.onHydrate }] : [],
  );

export function applyHydrateEdgeRules(ctx: HydrateEdgeContext): void {
  for (const rule of HYDRATE_EDGE_RULES) {
    if (rule.match(ctx.src.type, ctx.tgt.type)) {
      rule.apply(ctx);
      return;
    }
  }
}
