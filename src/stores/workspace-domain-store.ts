/**
 * Canonical domain state for the Lattice workspace (client).
 * Graph/canvas projects from this; compile + generation read relations here.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_COMPILER_PROVIDER } from '../lib/constants';
import { STORAGE_KEYS } from '../lib/storage-keys';
import type {
  AgentMode,
  DomainCritiqueContent,
  DomainDesignSystemContent,
  DomainHypothesis,
  DomainIncubatorWiring,
  DomainModelProfile,
  DomainVariantSlot,
  ThinkingLevel,
} from '../types/workspace-domain';
import {
  defaultIncubatorWiring,
  variantSlotKey,
} from '../types/workspace-domain';
import { NODE_TYPES } from '../constants/canvas';
import type { CanvasNodeType } from '../types/workspace-graph';
import type { HypothesisNodeData } from '../types/canvas-data';

function uniqPush(arr: string[], id: string): string[] {
  if (arr.includes(id)) return arr;
  return [...arr, id];
}

function removeId(arr: string[], id: string): string[] {
  return arr.filter((x) => x !== id);
}

function ensureWiring(
  wirings: Record<string, DomainIncubatorWiring>,
  incubatorId: string,
): DomainIncubatorWiring {
  return wirings[incubatorId] ?? defaultIncubatorWiring();
}

export interface WorkspaceDomainStore {
  incubatorWirings: Record<string, DomainIncubatorWiring>;
  incubatorModelNodeIds: Record<string, string[]>;
  hypotheses: Record<string, DomainHypothesis>;
  modelProfiles: Record<string, DomainModelProfile>;
  designSystems: Record<string, DomainDesignSystemContent>;
  critiques: Record<string, DomainCritiqueContent>;
  variantSlots: Record<string, DomainVariantSlot>;

  ensureIncubatorWiring: (incubatorId: string) => void;
  /** Model → incubator / hypothesis / designSystem */
  attachModelToTarget: (modelNodeId: string, targetId: string, targetType: CanvasNodeType) => void;
  detachModelFromTarget: (
    modelNodeId: string,
    targetId: string,
    targetType: CanvasNodeType,
  ) => void;
  /** Section / variant / critique → incubator */
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
  /** Design system → hypothesis */
  attachDesignSystemToHypothesis: (dsNodeId: string, hypothesisId: string) => void;
  detachDesignSystemFromHypothesis: (dsNodeId: string, hypothesisId: string) => void;
  /** Compiler → hypothesis link implies incubator id */
  linkHypothesisToIncubator: (
    hypothesisId: string,
    incubatorId: string,
    variantStrategyId: string,
  ) => void;
  setHypothesisGenerationSettings: (
    hypothesisId: string,
    partial: { agentMode?: AgentMode; thinkingLevel?: ThinkingLevel | undefined },
  ) => void;
  setHypothesisPlaceholder: (hypothesisId: string, placeholder: boolean) => void;
  removeHypothesis: (hypothesisId: string) => void;
  removeIncubator: (incubatorId: string) => void;

  upsertModelProfile: (nodeId: string, partial: Partial<DomainModelProfile>) => void;
  removeModelProfile: (nodeId: string) => void;
  /** Remove a model node from all incubator + hypothesis bindings */
  purgeModelNode: (modelNodeId: string) => void;
  upsertDesignSystem: (nodeId: string, partial: Partial<DomainDesignSystemContent>) => void;
  removeDesignSystem: (nodeId: string) => void;
  upsertCritique: (nodeId: string, partial: Partial<DomainCritiqueContent>) => void;
  removeCritique: (nodeId: string) => void;

  setVariantSlot: (
    hypothesisId: string,
    variantStrategyId: string,
    partial: Partial<DomainVariantSlot>,
  ) => void;
  removeVariantSlot: (hypothesisId: string, variantStrategyId: string) => void;

  reset: () => void;
}

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

      ensureIncubatorWiring: (incubatorId) =>
        set((s) => {
          if (s.incubatorWirings[incubatorId]) return s;
          return {
            incubatorWirings: {
              ...s.incubatorWirings,
              [incubatorId]: defaultIncubatorWiring(),
            },
          };
        }),

      attachModelToTarget: (modelNodeId: string, targetId: string, targetType: CanvasNodeType) =>
        set((s) => {
          if (targetType === NODE_TYPES.HYPOTHESIS) {
            const h = s.hypotheses[targetId];
            if (!h) return s;
            return {
              hypotheses: {
                ...s.hypotheses,
                [targetId]: {
                  ...h,
                  modelNodeIds: uniqPush(h.modelNodeIds, modelNodeId),
                },
              },
            };
          }
          if (targetType === NODE_TYPES.COMPILER) {
            const cur = s.incubatorModelNodeIds[targetId] ?? [];
            return {
              incubatorModelNodeIds: {
                ...s.incubatorModelNodeIds,
                [targetId]: uniqPush(cur, modelNodeId),
              },
            };
          }
          return s;
        }),

      detachModelFromTarget: (modelNodeId: string, targetId: string, targetType: CanvasNodeType) =>
        set((s) => {
          if (targetType === NODE_TYPES.HYPOTHESIS) {
            const h = s.hypotheses[targetId];
            if (!h) return s;
            return {
              hypotheses: {
                ...s.hypotheses,
                [targetId]: {
                  ...h,
                  modelNodeIds: removeId(h.modelNodeIds, modelNodeId),
                },
              },
            };
          }
          if (targetType === NODE_TYPES.COMPILER) {
            const cur = s.incubatorModelNodeIds[targetId];
            if (!cur) return s;
            return {
              incubatorModelNodeIds: {
                ...s.incubatorModelNodeIds,
                [targetId]: removeId(cur, modelNodeId),
              },
            };
          }
          return s;
        }),

      attachIncubatorInput: (incubatorId, sourceId, sourceType) =>
        set((s) => {
          const w = { ...ensureWiring(s.incubatorWirings, incubatorId) };
          if (SECTION_NODE_TYPES_COPY.has(sourceType)) {
            w.sectionNodeIds = uniqPush(w.sectionNodeIds, sourceId);
          } else if (sourceType === NODE_TYPES.VARIANT) {
            w.variantNodeIds = uniqPush(w.variantNodeIds, sourceId);
          } else if (sourceType === NODE_TYPES.CRITIQUE) {
            w.critiqueNodeIds = uniqPush(w.critiqueNodeIds, sourceId);
          } else return s;
          return {
            incubatorWirings: { ...s.incubatorWirings, [incubatorId]: w },
          };
        }),

      detachIncubatorInput: (incubatorId, sourceId, sourceType) =>
        set((s) => {
          const cur = s.incubatorWirings[incubatorId];
          if (!cur) return s;
          const w = { ...cur };
          if (SECTION_NODE_TYPES_COPY.has(sourceType)) {
            w.sectionNodeIds = removeId(w.sectionNodeIds, sourceId);
          } else if (sourceType === NODE_TYPES.VARIANT) {
            w.variantNodeIds = removeId(w.variantNodeIds, sourceId);
          } else if (sourceType === NODE_TYPES.CRITIQUE) {
            w.critiqueNodeIds = removeId(w.critiqueNodeIds, sourceId);
          } else return s;
          return {
            incubatorWirings: { ...s.incubatorWirings, [incubatorId]: w },
          };
        }),

      attachDesignSystemToHypothesis: (dsNodeId, hypothesisId) =>
        set((s) => {
          const h = s.hypotheses[hypothesisId];
          if (!h) return s;
          return {
            hypotheses: {
              ...s.hypotheses,
              [hypothesisId]: {
                ...h,
                designSystemNodeIds: uniqPush(h.designSystemNodeIds, dsNodeId),
              },
            },
          };
        }),

      detachDesignSystemFromHypothesis: (dsNodeId, hypothesisId) =>
        set((s) => {
          const h = s.hypotheses[hypothesisId];
          if (!h) return s;
          return {
            hypotheses: {
              ...s.hypotheses,
              [hypothesisId]: {
                ...h,
                designSystemNodeIds: removeId(h.designSystemNodeIds, dsNodeId),
              },
            },
          };
        }),

      linkHypothesisToIncubator: (hypothesisId, incubatorId, variantStrategyId) =>
        set((s) => {
          const prev = s.hypotheses[hypothesisId];
          const next: DomainHypothesis = {
            id: hypothesisId,
            incubatorId,
            variantStrategyId,
            modelNodeIds: prev?.modelNodeIds ?? [],
            designSystemNodeIds: prev?.designSystemNodeIds ?? [],
            agentMode: prev?.agentMode ?? 'single',
            thinkingLevel: prev?.thinkingLevel,
            placeholder: prev?.placeholder ?? false,
          };
          const k = variantSlotKey(hypothesisId, variantStrategyId);
          const slot: DomainVariantSlot = s.variantSlots[k] ?? {
            hypothesisId,
            variantStrategyId,
            variantNodeId: null,
            activeResultId: null,
            pinnedRunId: null,
          };
          return {
            hypotheses: { ...s.hypotheses, [hypothesisId]: next },
            variantSlots: { ...s.variantSlots, [k]: slot },
          };
        }),

      setHypothesisGenerationSettings: (hypothesisId, partial) =>
        set((s) => {
          const h = s.hypotheses[hypothesisId];
          if (!h) return s;
          return {
            hypotheses: {
              ...s.hypotheses,
              [hypothesisId]: {
                ...h,
                ...('agentMode' in partial && partial.agentMode !== undefined
                  ? { agentMode: partial.agentMode }
                  : {}),
                ...('thinkingLevel' in partial ? { thinkingLevel: partial.thinkingLevel } : {}),
              },
            },
          };
        }),

      setHypothesisPlaceholder: (hypothesisId, placeholder) =>
        set((s) => {
          const h = s.hypotheses[hypothesisId];
          if (!h) return s;
          return {
            hypotheses: {
              ...s.hypotheses,
              [hypothesisId]: { ...h, placeholder },
            },
          };
        }),

      removeHypothesis: (hypothesisId) =>
        set((s) => {
          const restH = { ...s.hypotheses };
          delete restH[hypothesisId];
          const vs = { ...s.variantSlots };
          for (const k of Object.keys(vs)) {
            if (k.startsWith(`${hypothesisId}::`)) delete vs[k];
          }
          return { hypotheses: restH, variantSlots: vs };
        }),

      removeIncubator: (incubatorId) =>
        set((s) => {
          const restW = { ...s.incubatorWirings };
          delete restW[incubatorId];
          const restIncModels = { ...s.incubatorModelNodeIds };
          delete restIncModels[incubatorId];
          const restH = { ...s.hypotheses };
          for (const [hid, h] of Object.entries(restH)) {
            if (h.incubatorId === incubatorId) delete restH[hid];
          }
          return {
            incubatorWirings: restW,
            incubatorModelNodeIds: restIncModels,
            hypotheses: restH,
          };
        }),

      upsertModelProfile: (nodeId, partial) =>
        set((s) => {
          const cur = s.modelProfiles[nodeId] ?? {
            nodeId,
            providerId: DEFAULT_COMPILER_PROVIDER,
            modelId: '',
          };
          return {
            modelProfiles: {
              ...s.modelProfiles,
              [nodeId]: { ...cur, ...partial, nodeId },
            },
          };
        }),

      removeModelProfile: (nodeId) =>
        set((s) => {
          const rest = { ...s.modelProfiles };
          delete rest[nodeId];
          return { modelProfiles: rest };
        }),

      purgeModelNode: (modelNodeId) =>
        set((s) => {
          const restProf = { ...s.modelProfiles };
          delete restProf[modelNodeId];
          const nextInc: Record<string, string[]> = {};
          for (const [k, ids] of Object.entries(s.incubatorModelNodeIds)) {
            nextInc[k] = removeId(ids, modelNodeId);
          }
          const nextH = { ...s.hypotheses };
          for (const [hid, h] of Object.entries(nextH)) {
            if (!h.modelNodeIds.includes(modelNodeId)) continue;
            nextH[hid] = {
              ...h,
              modelNodeIds: removeId(h.modelNodeIds, modelNodeId),
            };
          }
          return {
            modelProfiles: restProf,
            incubatorModelNodeIds: nextInc,
            hypotheses: nextH,
          };
        }),

      upsertDesignSystem: (nodeId, partial) =>
        set((s) => {
          const cur = s.designSystems[nodeId] ?? {
            nodeId,
            title: '',
            content: '',
            images: [],
          };
          return {
            designSystems: {
              ...s.designSystems,
              [nodeId]: {
                ...cur,
                ...partial,
                nodeId,
                images: partial.images ?? cur.images,
              },
            },
          };
        }),

      removeDesignSystem: (nodeId) =>
        set((s) => {
          const rest = { ...s.designSystems };
          delete rest[nodeId];
          return { designSystems: rest };
        }),

      upsertCritique: (nodeId, partial) =>
        set((s) => {
          const cur = s.critiques[nodeId] ?? {
            nodeId,
            title: '',
            strengths: '',
            improvements: '',
            direction: '',
          };
          return {
            critiques: {
              ...s.critiques,
              [nodeId]: { ...cur, ...partial, nodeId },
            },
          };
        }),

      removeCritique: (nodeId) =>
        set((s) => {
          const rest = { ...s.critiques };
          delete rest[nodeId];
          return { critiques: rest };
        }),

      setVariantSlot: (hypothesisId, variantStrategyId, partial) =>
        set((s) => {
          const k = variantSlotKey(hypothesisId, variantStrategyId);
          const cur = s.variantSlots[k] ?? {
            hypothesisId,
            variantStrategyId,
            variantNodeId: null,
            activeResultId: null,
            pinnedRunId: null,
          };
          return { variantSlots: { ...s.variantSlots, [k]: { ...cur, ...partial } } };
        }),

      removeVariantSlot: (hypothesisId, variantStrategyId) =>
        set((s) => {
          const k = variantSlotKey(hypothesisId, variantStrategyId);
          const rest = { ...s.variantSlots };
          delete rest[k];
          return { variantSlots: rest };
        }),

      reset: () => set(empty()),
    }),
    {
      name: STORAGE_KEYS.WORKSPACE_DOMAIN,
      partialize: (state) => ({
        incubatorWirings: state.incubatorWirings,
        incubatorModelNodeIds: state.incubatorModelNodeIds,
        hypotheses: state.hypotheses,
        modelProfiles: state.modelProfiles,
        designSystems: state.designSystems,
        critiques: state.critiques,
        variantSlots: state.variantSlots,
      }),
      version: 2,
      migrate: (persisted: unknown, fromVersion: number) => {
        const p = persisted as Record<string, unknown>;
        if (fromVersion < 2) {
          return { ...p, incubatorModelNodeIds: (p.incubatorModelNodeIds as Record<string, string[]> | undefined) ?? {} };
        }
        return persisted;
      },
    },
  ),
);

// Local copy of section types for store (avoid importing canvas-layout cycle)
const SECTION_NODE_TYPES_COPY = new Set<CanvasNodeType>([
  NODE_TYPES.DESIGN_BRIEF,
  NODE_TYPES.EXISTING_DESIGN,
  NODE_TYPES.RESEARCH_CONTEXT,
  NODE_TYPES.OBJECTIVES_METRICS,
  NODE_TYPES.DESIGN_CONSTRAINTS,
]);

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
        store.linkHypothesisToIncubator(tgt.id, findIncubatorForHypothesis(input, tgt.id) ?? 'unknown', h.refId as string);
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
    if (SECTION_NODE_TYPES_COPY.has(src.type as CanvasNodeType) && tgt.type === NODE_TYPES.COMPILER) {
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

function findIncubatorForHypothesis(
  input: { nodes: { id: string; type: string }[]; edges: { source: string; target: string }[] },
  hypothesisId: string,
): string | null {
  for (const e of input.edges) {
    if (e.target !== hypothesisId) continue;
    const src = input.nodes.find((n) => n.id === e.source);
    if (src?.type === NODE_TYPES.COMPILER) return src.id;
  }
  return null;
}
