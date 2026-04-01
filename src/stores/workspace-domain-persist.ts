import type { WorkspaceDomainStore } from './workspace-domain-store-types';
import { STORAGE_KEYS } from '../lib/storage-keys';

export const workspaceDomainPersistOptions = {
  name: STORAGE_KEYS.WORKSPACE_DOMAIN,
  partialize: (state: WorkspaceDomainStore) => ({
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
      return {
        ...p,
        incubatorModelNodeIds: (p.incubatorModelNodeIds as Record<string, string[]> | undefined) ?? {},
      };
    }
    return persisted;
  },
};
