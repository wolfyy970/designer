/**
 * Canonical domain state for the Auto Designer workspace (client).
 * Graph/canvas projects from this; compile + generation read relations here.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  | 'setPreviewSlot'
  | 'removePreviewSlot'
  | 'reset'
> => ({
  incubatorWirings: {},
  incubatorModelNodeIds: {},
  hypotheses: {},
  modelProfiles: {},
  designSystems: {},
  previewSlots: {},
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
