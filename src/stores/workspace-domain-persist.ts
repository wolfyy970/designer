import type {
  AgentMode,
  DomainHypothesis,
  DomainModelProfile,
} from '../types/workspace-domain';
import type { WorkspaceDomainStore } from './workspace-domain-store-types';
import { STORAGE_KEYS } from '../lib/storage-keys';

type DomainHypothesisV2 = DomainHypothesis & { agentMode?: AgentMode };

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
  version: 4,
  migrate: (persisted: unknown, fromVersion: number) => {
    let p = persisted as Record<string, unknown>;
    if (fromVersion < 2) {
      p = {
        ...p,
        incubatorModelNodeIds: (p.incubatorModelNodeIds as Record<string, string[]> | undefined) ?? {},
      };
    }
    if (fromVersion < 3) {
      type ProfV3 = DomainModelProfile & { agentMode?: AgentMode };
      const rawHyp = (p.hypotheses as Record<string, DomainHypothesisV2>) ?? {};
      const modelProfiles = { ...(p.modelProfiles as Record<string, ProfV3>) };
      const hypotheses: Record<string, DomainHypothesis> = {};
      for (const [hid, h] of Object.entries(rawHyp)) {
        const am = h.agentMode ?? 'single';
        for (const mid of h.modelNodeIds) {
          const cur = modelProfiles[mid];
          if (cur) {
            modelProfiles[mid] = { ...cur, agentMode: cur.agentMode ?? am };
          }
        }
        const { agentMode, ...rest } = h;
        void agentMode;
        hypotheses[hid] = rest as DomainHypothesis;
      }
      p = { ...p, hypotheses, modelProfiles: modelProfiles as Record<string, DomainModelProfile> };
    }
    if (fromVersion < 4) {
      type LegacyHyp = DomainHypothesis & {
        thinkingLevel?: string;
        agentMode?: AgentMode;
      };
      type LegacyProf = DomainModelProfile & { agentMode?: AgentMode };
      const rawHyp = (p.hypotheses as Record<string, LegacyHyp>) ?? {};
      const modelProfiles = { ...(p.modelProfiles as Record<string, LegacyProf>) };
      const hypotheses: Record<string, DomainHypothesis> = {};

      for (const [hid, h] of Object.entries(rawHyp)) {
        let aggregated: AgentMode = 'single';
        for (const mid of h.modelNodeIds) {
          const prof = modelProfiles[mid];
          if (prof?.agentMode === 'agentic') aggregated = 'agentic';
        }
        const laneThinking =
          (h as { thinkingLevel?: string }).thinkingLevel ?? 'minimal';

        for (const mid of h.modelNodeIds) {
          const cur = modelProfiles[mid];
          if (!cur) continue;
          const { agentMode: _drop, ...rest } = cur;
          void _drop;
          modelProfiles[mid] = {
            ...rest,
            thinkingLevel: cur.thinkingLevel ?? laneThinking,
          } as LegacyProf;
        }

        hypotheses[hid] = {
          id: h.id,
          incubatorId: h.incubatorId,
          variantStrategyId: h.variantStrategyId,
          modelNodeIds: h.modelNodeIds,
          designSystemNodeIds: h.designSystemNodeIds,
          placeholder: h.placeholder,
          agentMode: aggregated,
        };
      }

      for (const [mid, prof] of Object.entries(modelProfiles)) {
        const { agentMode: _d, ...rest } = prof;
        void _d;
        modelProfiles[mid] = rest as LegacyProf;
      }

      p = { ...p, hypotheses, modelProfiles: modelProfiles as Record<string, DomainModelProfile> };
    }
    return p;
  },
};
