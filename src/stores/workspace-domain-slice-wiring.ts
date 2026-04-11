import { NODE_TYPES, INPUT_NODE_TYPES } from '../constants/canvas';
import type { CanvasNodeType } from '../types/workspace-graph';
import { defaultIncubatorWiring } from '../types/workspace-domain';
import { ensureWiring, uniqPush, removeId } from './workspace-domain-helpers';
import type { WorkspaceDomainStore } from './workspace-domain-store-types';

type DomainSet = (
  partial:
    | Partial<WorkspaceDomainStore>
    | ((state: WorkspaceDomainStore) => Partial<WorkspaceDomainStore> | WorkspaceDomainStore),
) => void;

export function createWorkspaceDomainWiringSlice(set: DomainSet): Pick<
  WorkspaceDomainStore,
  | 'ensureIncubatorWiring'
  | 'attachModelToTarget'
  | 'detachModelFromTarget'
  | 'attachIncubatorInput'
  | 'detachIncubatorInput'
> {
  return {
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
                /** At most one model per hypothesis (matches canvas: single model→hypothesis edge). */
                modelNodeIds: [modelNodeId],
              },
            },
          };
        }
        if (targetType === NODE_TYPES.INCUBATOR) {
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
        if (targetType === NODE_TYPES.INCUBATOR) {
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
        if (INPUT_NODE_TYPES.has(sourceType)) {
          w.inputNodeIds = uniqPush(w.inputNodeIds, sourceId);
        } else if (sourceType === NODE_TYPES.PREVIEW) {
          w.previewNodeIds = uniqPush(w.previewNodeIds, sourceId);
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
        if (INPUT_NODE_TYPES.has(sourceType)) {
          w.inputNodeIds = removeId(w.inputNodeIds, sourceId);
        } else if (sourceType === NODE_TYPES.PREVIEW) {
          w.previewNodeIds = removeId(w.previewNodeIds, sourceId);
        } else return s;
        return {
          incubatorWirings: { ...s.incubatorWirings, [incubatorId]: w },
        };
      }),
  };
}
