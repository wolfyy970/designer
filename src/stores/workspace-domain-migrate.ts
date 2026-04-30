import type {
  DomainHypothesis,
  DomainIncubatorWiring,
  DomainModelProfile,
  DomainPreviewSlot,
} from '../types/workspace-domain';

/** Legacy persisted values before `GenerationMode` was collapsed to agentic-only. */
type LegacyAgentMode = 'single' | 'agentic';

type DomainHypothesisV2 = DomainHypothesis & { agentMode?: LegacyAgentMode };

/**
 * Zustand persist migration for workspace domain store (versioned).
 * @param persisted — raw persisted state
 * @param fromVersion — store version before migration
 */
export function migrateWorkspaceDomainPersist(persisted: unknown, fromVersion: number): unknown {
  let p = isRecord(persisted) ? persisted : {};
  if (fromVersion < 2) {
    p = {
      ...p,
      incubatorModelNodeIds: (p.incubatorModelNodeIds as Record<string, string[]> | undefined) ?? {},
    };
  }
  if (fromVersion < 3) {
    type ProfV3 = DomainModelProfile & { agentMode?: LegacyAgentMode };
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
      agentMode?: LegacyAgentMode;
      variantStrategyId?: string;
    };
    type LegacyProf = DomainModelProfile & { agentMode?: LegacyAgentMode };
    const rawHyp = (p.hypotheses as Record<string, LegacyHyp>) ?? {};
    const modelProfiles = { ...(p.modelProfiles as Record<string, LegacyProf>) };
    const hypotheses: Record<string, DomainHypothesis> = {};

    for (const [hid, h] of Object.entries(rawHyp)) {
      let aggregated: LegacyAgentMode = 'single';
      for (const mid of h.modelNodeIds) {
        const prof = modelProfiles[mid];
        if (prof?.agentMode === 'agentic') aggregated = 'agentic';
      }
      const laneThinking = (h as { thinkingLevel?: string }).thinkingLevel ?? 'minimal';

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
        strategyId: h.strategyId ?? ((h as unknown as Record<string, unknown>).variantStrategyId as string),
        modelNodeIds: h.modelNodeIds,
        designSystemNodeIds: h.designSystemNodeIds,
        placeholder: h.placeholder,
        agentMode: aggregated,
      } as DomainHypothesis & { agentMode: LegacyAgentMode };
    }

    for (const [mid, prof] of Object.entries(modelProfiles)) {
      const { agentMode: _d, ...rest } = prof;
      void _d;
      modelProfiles[mid] = rest as LegacyProf;
    }

    p = { ...p, hypotheses, modelProfiles: modelProfiles as Record<string, DomainModelProfile> };
  }
  if (fromVersion < 5) {
    const { critiques: _dropCritiques, ...rest } = p;
    void _dropCritiques;
    const rawW = (rest.incubatorWirings as Record<string, Record<string, unknown>>) ?? {};
    const incubatorWirings: Record<string, DomainIncubatorWiring> = {};
    for (const [k, w] of Object.entries(rawW)) {
      incubatorWirings[k] = {
        inputNodeIds: (w.sectionNodeIds as string[] | undefined) ?? (w.inputNodeIds as string[] | undefined) ?? [],
        previewNodeIds: (w.previewNodeIds as string[] | undefined) ?? (w.variantNodeIds as string[] | undefined) ?? [],
        designSystemNodeIds: (w.designSystemNodeIds as string[] | undefined) ?? [],
      };
    }
    p = { ...rest, incubatorWirings };
  }
  if (fromVersion < 6) {
    const rawSlots = (p.variantSlots ?? p.previewSlots) as Record<string, Record<string, unknown>> | undefined;
    const previewSlots: Record<string, DomainPreviewSlot> = {};
    if (rawSlots) {
      for (const [k, slot] of Object.entries(rawSlots)) {
        previewSlots[k] = {
          hypothesisId: slot.hypothesisId as string,
          strategyId: (slot.strategyId ?? slot.variantStrategyId) as string,
          previewNodeId: (slot.previewNodeId ?? slot.variantNodeId ?? null) as string | null,
          activeResultId: (slot.activeResultId ?? null) as string | null,
          pinnedRunId: (slot.pinnedRunId ?? null) as string | null,
        };
      }
    }
    delete p.variantSlots;
    p = { ...p, previewSlots };

    const rawHyp = (p.hypotheses as Record<string, Record<string, unknown>>) ?? {};
    const hypotheses: Record<string, DomainHypothesis> = {};
    for (const [hid, h] of Object.entries(rawHyp)) {
      hypotheses[hid] = {
        ...h,
        strategyId: (h.strategyId ?? h.variantStrategyId) as string,
      } as DomainHypothesis;
      delete (hypotheses[hid] as unknown as Record<string, unknown>).variantStrategyId;
    }
    p = { ...p, hypotheses };

    const rawW = (p.incubatorWirings as Record<string, Record<string, unknown>>) ?? {};
    const incubatorWirings: Record<string, DomainIncubatorWiring> = {};
    for (const [k, w] of Object.entries(rawW)) {
      incubatorWirings[k] = {
        inputNodeIds: (w.sectionNodeIds as string[] | undefined) ?? (w.inputNodeIds as string[] | undefined) ?? [],
        previewNodeIds: (w.previewNodeIds as string[] | undefined) ?? (w.variantNodeIds as string[] | undefined) ?? [],
        designSystemNodeIds: (w.designSystemNodeIds as string[] | undefined) ?? [],
      };
    }
    p = { ...p, incubatorWirings };
  }
  if (fromVersion < 7) {
    const rawW = (p.incubatorWirings as Record<string, Record<string, unknown>>) ?? {};
    const incubatorWirings: Record<string, DomainIncubatorWiring> = {};
    for (const [k, w] of Object.entries(rawW)) {
      const inputNodeIds =
        (w.inputNodeIds as string[] | undefined) ?? (w.sectionNodeIds as string[] | undefined) ?? [];
      incubatorWirings[k] = {
        inputNodeIds,
        previewNodeIds: (w.previewNodeIds as string[] | undefined) ?? [],
        designSystemNodeIds: (w.designSystemNodeIds as string[] | undefined) ?? [],
      };
    }
    p = { ...p, incubatorWirings };
  }
  if (fromVersion < 8) {
    const rawHyp = (p.hypotheses as Record<string, Record<string, unknown>>) ?? {};
    const hypotheses: Record<string, DomainHypothesis> = {};
    for (const [hid, row] of Object.entries(rawHyp)) {
      const copy = { ...row };
      const legacyMode = copy.agentMode as LegacyAgentMode | undefined;
      delete copy.agentMode;
      const revisionEnabled =
        typeof copy.revisionEnabled === 'boolean' ? copy.revisionEnabled : legacyMode === 'agentic';
      hypotheses[hid] = {
        ...copy,
        revisionEnabled,
        placeholder: Boolean(copy.placeholder),
      } as DomainHypothesis;
    }
    p = { ...p, hypotheses };
  }
  if (fromVersion < 9) {
    const rawHyp = (p.hypotheses as Record<string, DomainHypothesis>) ?? {};
    const hypotheses: Record<string, DomainHypothesis> = {};
    for (const [hid, h] of Object.entries(rawHyp)) {
      hypotheses[hid] = {
        ...h,
        modelNodeIds: h.modelNodeIds.slice(0, 1),
      };
    }
    p = { ...p, hypotheses };
  }
  if (fromVersion < 10) {
    const rawW = (p.incubatorWirings as Record<string, Record<string, unknown>>) ?? {};
    const incubatorWirings: Record<string, DomainIncubatorWiring> = {};
    for (const [k, w] of Object.entries(rawW)) {
      incubatorWirings[k] = {
        inputNodeIds: (w.inputNodeIds as string[] | undefined) ?? [],
        previewNodeIds: (w.previewNodeIds as string[] | undefined) ?? [],
        designSystemNodeIds: (w.designSystemNodeIds as string[] | undefined) ?? [],
      };
    }
    p = { ...p, incubatorWirings };
  }
  if (fromVersion < 11) {
    const rawW = (p.incubatorWirings as Record<string, DomainIncubatorWiring>) ?? {};
    const incubatorWirings: Record<string, DomainIncubatorWiring> = {};
    for (const [k, w] of Object.entries(rawW)) {
      incubatorWirings[k] = {
        ...w,
        inputNodeIds: w.inputNodeIds.filter((id) => !id.startsWith('existingDesign')),
      };
    }
    p = { ...p, incubatorWirings };
  }
  return normalizeWorkspaceDomainPersistShape(p);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeWorkspaceDomainPersistShape(p: Record<string, unknown>): Record<string, unknown> {
  return {
    ...p,
    incubatorWirings: recordOrEmpty(p.incubatorWirings),
    incubatorModelNodeIds: recordOrEmpty(p.incubatorModelNodeIds),
    hypotheses: recordOrEmpty(p.hypotheses),
    modelProfiles: recordOrEmpty(p.modelProfiles),
    designSystems: recordOrEmpty(p.designSystems),
    previewSlots: recordOrEmpty(p.previewSlots),
  };
}
