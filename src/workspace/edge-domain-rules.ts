import type { CanvasNodeType } from '../types/workspace-graph';
import {
  EDGE_DOMAIN_RULES,
  type EdgeDomainRule,
  type HydrateEdgeContext,
  type HydrateGraphSnapshot,
  type IncrementalNewEdgeContext,
  type IncrementalRemovedEdgeContext,
} from './canvas-edge-contracts';

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

export { EDGE_DOMAIN_RULES };
export type {
  EdgeDomainRule,
  HydrateEdgeContext,
  HydrateGraphSnapshot,
  IncrementalNewEdgeContext,
  IncrementalRemovedEdgeContext,
};

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
