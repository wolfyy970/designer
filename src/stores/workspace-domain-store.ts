/**
 * Canonical domain state for the Auto Designer workspace (client).
 * Graph/canvas projects from this; compile + generation read relations here.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_COMPILER_PROVIDER } from '../lib/constants';
import type { CanvasNodeType } from '../types/workspace-graph';
import type { HypothesisNodeData } from '../types/canvas-data';
import type {
  DomainDesignSystemContent,
} from '../types/workspace-domain';
import { NODE_TYPES } from '../constants/canvas';
import {
  findIncubatorForHypothesis,
  SECTION_NODE_TYPES_FOR_DOMAIN,
} from './workspace-domain-helpers';
import { workspaceDomainPersistOptions } from './workspace-domain-persist';
import { createWorkspaceDomainWiringSlice } from './workspace-domain-slice-wiring';
import { createWorkspaceDomainHypothesisSlice } from './workspace-domain-slice-hypothesis';
import { createWorkspaceDomainEntitiesSlice } from './workspace-domain-slice-entities';
import type { WorkspaceDomainStore } from './workspace-domain-store-types';

export type { WorkspaceDomainStore } from './workspace-domain-store-types';

const empty = (): Omit<
  WorkspaceDomainStore,
  | 'ensureIncubatorWiring'
  | 'attachModelToTarget'
  | 'detachModelFromTarget'
  | 'attachIncubatorInput'
  | 'detachIncubatorInput'
  | 'attachDesignSystemToHypothesis'
  | 'detachDesignSystemFromHypothesis'
  | 'linkHypothesisToIncubator'
  | 'setHypothesisGenerationSettings'
  | 'setHypothesisPlaceholder'
  | 'removeHypothesis'
  | 'removeIncubator'
  | 'upsertModelProfile'
  | 'removeModelProfile'
  | 'purgeModelNode'
  | 'upsertDesignSystem'
  | 'removeDesignSystem'
  | 'upsertCritique'
  | 'removeCritique'
  | 'setVariantSlot'
  | 'removeVariantSlot'
  | 'reset'
> => ({
  incubatorWirings: {},
  incubatorModelNodeIds: {},
  hypotheses: {},
  modelProfiles: {},
  designSystems: {},
  critiques: {},
  variantSlots: {},
});

export const useWorkspaceDomainStore = create<WorkspaceDomainStore>()(
  persist(
    (set) => ({
      ...empty(),
      ...createWorkspaceDomainWiringSlice(set),
      ...createWorkspaceDomainHypothesisSlice(set),
      ...createWorkspaceDomainEntitiesSlice(set),
      reset: () => set(empty()),
    }),
    workspaceDomainPersistOptions,
  ),
);

/** Hydrate domain from an existing canvas snapshot (best-effort, one-time style). */
export function hydrateDomainFromCanvasGraph(input: {
  nodes: { id: string; type: CanvasNodeType; data: Record<string, unknown> }[];
  edges: { source: string; target: string }[];
}): void {
  const store = useWorkspaceDomainStore.getState();
  /* Always merge from canvas (idempotent uniqPush / link); safe to re-run after load. */

  for (const n of input.nodes) {
    if (n.type === NODE_TYPES.MODEL) {
      const d = n.data as { providerId?: string; modelId?: string; title?: string };
      store.upsertModelProfile(n.id, {
        providerId: d.providerId || DEFAULT_COMPILER_PROVIDER,
        modelId: d.modelId || '',
        title: d.title,
      });
    }
    if (n.type === NODE_TYPES.DESIGN_SYSTEM) {
      const d = n.data as {
        title?: string;
        content?: string;
        images?: unknown;
        providerId?: string;
        modelId?: string;
      };
      store.upsertDesignSystem(n.id, {
        title: d.title ?? '',
        content: d.content ?? '',
        images: Array.isArray(d.images) ? d.images as DomainDesignSystemContent['images'] : [],
        providerMigration: d.providerId,
        modelMigration: d.modelId,
      });
    }
    if (n.type === NODE_TYPES.CRITIQUE) {
      const d = n.data as {
        title?: string;
        strengths?: string;
        improvements?: string;
        direction?: string;
      };
      store.upsertCritique(n.id, {
        title: d.title ?? '',
        strengths: d.strengths ?? '',
        improvements: d.improvements ?? '',
        direction: d.direction ?? '',
      });
    }
  }

  const compilerHypFirst = (e: { source: string; target: string }) => {
    const src = input.nodes.find((n) => n.id === e.source);
    const tgt = input.nodes.find((n) => n.id === e.target);
    return src?.type === NODE_TYPES.COMPILER && tgt?.type === NODE_TYPES.HYPOTHESIS;
  };
  const orderedEdges = [
    ...input.edges.filter(compilerHypFirst),
    ...input.edges.filter((e) => !compilerHypFirst(e)),
  ];

  for (const e of orderedEdges) {
    const src = input.nodes.find((n) => n.id === e.source);
    const tgt = input.nodes.find((n) => n.id === e.target);
    if (!src || !tgt) continue;

    if (src.type === NODE_TYPES.MODEL && tgt.type === NODE_TYPES.COMPILER) {
      store.ensureIncubatorWiring(tgt.id);
      store.attachModelToTarget(src.id, tgt.id, NODE_TYPES.COMPILER);
    }
    if (src.type === NODE_TYPES.MODEL && tgt.type === NODE_TYPES.HYPOTHESIS) {
      store.attachModelToTarget(src.id, tgt.id, NODE_TYPES.HYPOTHESIS);
      const h = tgt.data as HypothesisNodeData;
      if (h.refId) {
        store.linkHypothesisToIncubator(
          tgt.id,
          findIncubatorForHypothesis(input, tgt.id) ?? 'unknown',
          h.refId as string,
        );
      }
    }
    if (src.type === NODE_TYPES.MODEL && tgt.type === NODE_TYPES.DESIGN_SYSTEM) {
      /* Model feeds design-system extraction only; no incubator id on DS node. */
    }
    if (src.type === NODE_TYPES.COMPILER && tgt.type === NODE_TYPES.HYPOTHESIS) {
      const h = tgt.data as HypothesisNodeData;
      if (h.refId) {
        store.linkHypothesisToIncubator(tgt.id, src.id, h.refId as string);
      }
      store.setHypothesisPlaceholder(tgt.id, Boolean(h.placeholder));
    }
    if (SECTION_NODE_TYPES_FOR_DOMAIN.has(src.type as CanvasNodeType) && tgt.type === NODE_TYPES.COMPILER) {
      store.ensureIncubatorWiring(tgt.id);
      store.attachIncubatorInput(tgt.id, src.id, src.type);
    }
    if (src.type === NODE_TYPES.VARIANT && tgt.type === NODE_TYPES.COMPILER) {
      store.ensureIncubatorWiring(tgt.id);
      store.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.VARIANT);
    }
    if (src.type === NODE_TYPES.CRITIQUE && tgt.type === NODE_TYPES.COMPILER) {
      store.ensureIncubatorWiring(tgt.id);
      store.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.CRITIQUE);
    }
    if (src.type === NODE_TYPES.DESIGN_SYSTEM && tgt.type === NODE_TYPES.HYPOTHESIS) {
      store.attachDesignSystemToHypothesis(src.id, tgt.id);
      const h = tgt.data as HypothesisNodeData;
      if (h.refId) {
        const inc = findIncubatorForHypothesis(input, tgt.id);
        if (inc) store.linkHypothesisToIncubator(tgt.id, inc, h.refId as string);
      }
    }
  }
}
