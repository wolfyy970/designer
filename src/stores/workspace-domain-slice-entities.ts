import { DEFAULT_INCUBATOR_PROVIDER } from '../lib/constants';
import type { DomainModelProfile } from '../types/workspace-domain';
import { removeId } from './workspace-domain-helpers';
import type { WorkspaceDomainStore } from './workspace-domain-store-types';

type DomainSet = (
  partial:
    | Partial<WorkspaceDomainStore>
    | ((state: WorkspaceDomainStore) => Partial<WorkspaceDomainStore> | WorkspaceDomainStore),
) => void;

export function createWorkspaceDomainEntitiesSlice(set: DomainSet): Pick<
  WorkspaceDomainStore,
  | 'upsertModelProfile'
  | 'removeModelProfile'
  | 'purgeModelNode'
  | 'upsertDesignSystem'
  | 'removeDesignSystem'
> {
  return {
    upsertModelProfile: (nodeId, partial) =>
      set((s) => {
        const cur = s.modelProfiles[nodeId] ?? {
          nodeId,
          providerId: DEFAULT_INCUBATOR_PROVIDER,
          modelId: '',
        };
        type ProfilePatch = Omit<Partial<DomainModelProfile>, 'nodeId'>;
        const cleaned: ProfilePatch = {};
        if (partial.providerId !== undefined) cleaned.providerId = partial.providerId;
        if (partial.modelId !== undefined) cleaned.modelId = partial.modelId;
        if (partial.title !== undefined) cleaned.title = partial.title;
        if (partial.thinkingLevel !== undefined) cleaned.thinkingLevel = partial.thinkingLevel;
        return {
          modelProfiles: {
            ...s.modelProfiles,
            [nodeId]: { ...cur, ...cleaned, nodeId },
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
  };
}
