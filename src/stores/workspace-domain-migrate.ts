import { isRecord } from '../lib/is-record';
import type {
  DomainHypothesis,
  DomainIncubatorWiring,
  DomainPreviewSlot,
} from '../types/workspace-domain';

/**
 * Persisted hypothesis shape across all historical versions, including the
 * pre-v12 `modelNodeIds` field that has since been removed from
 * `DomainHypothesis`. Used only inside this migration file.
 */
type PersistedHypothesis = DomainHypothesis & {
  modelNodeIds: string[];
};

// Old shape; kept as a local alias so legacy migration code compiles.
type DomainModelProfile = {
  nodeId: string;
  providerId: string;
  modelId: string;
  title?: string;
  thinkingLevel?: string;
  agentMode?: 'single' | 'agentic';
};

/** Legacy persisted values before `GenerationMode` was collapsed to agentic-only. */
type LegacyAgentMode = 'single' | 'agentic';

type LegacyHypothesisWithAgentMode = PersistedHypothesis & { agentMode?: LegacyAgentMode };

/**
 * Read a string-array field from a persisted row that may predate the field, or
 * hold a non-array from a hand-edited/partially-written blob.
 *
 * Every migrated field removed from `DomainHypothesis` / `DomainIncubatorWiring`
 * is still read by earlier ladder steps, and the values were cast
 * (`as string[]`) rather than checked — so a missing field threw
 * `TypeError: … is not iterable` inside the migrator.
 *
 * That mattered more than a bad cast normally would, because of *where* it ran:
 * `workspace-domain-persist.ts` hands the migrator to `persist` with no
 * try/catch (unlike `canvas-store.ts`, which wraps and falls back). Zustand's
 * hydration `.catch` then swallowed the throw, the store kept its empty
 * defaults, and every hypothesis, wiring, design-system attachment and preview
 * slot disappeared — silently, and again on every reload, since the stored
 * version never advanced.
 *
 * These fields only ever fed derived legacy data (model profiles, section
 * wiring), so treating an absent or malformed value as empty is correct: the
 * row is preserved and the removed field contributes nothing.
 */
function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

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
    const rawHyp = (p.hypotheses as Record<string, LegacyHypothesisWithAgentMode>) ?? {};
    const modelProfiles = { ...(p.modelProfiles as Record<string, ProfV3>) };
    const hypotheses: Record<string, PersistedHypothesis> = {};
    for (const [hid, h] of Object.entries(rawHyp)) {
      const am = h.agentMode ?? 'single';
      for (const mid of asStringArray(h.modelNodeIds)) {
        const cur = modelProfiles[mid];
        if (cur) {
          modelProfiles[mid] = { ...cur, agentMode: cur.agentMode ?? am };
        }
      }
      const { agentMode, ...rest } = h;
      void agentMode;
      hypotheses[hid] = rest as PersistedHypothesis;
    }
    p = { ...p, hypotheses, modelProfiles: modelProfiles as Record<string, DomainModelProfile> };
  }
  if (fromVersion < 4) {
    type LegacyHyp = PersistedHypothesis & {
      thinkingLevel?: string;
      agentMode?: LegacyAgentMode;
      variantStrategyId?: string;
    };
    type LegacyProf = DomainModelProfile & { agentMode?: LegacyAgentMode };
    const rawHyp = (p.hypotheses as Record<string, LegacyHyp>) ?? {};
    const modelProfiles = { ...(p.modelProfiles as Record<string, LegacyProf>) };
    const hypotheses: Record<string, PersistedHypothesis> = {};

    for (const [hid, h] of Object.entries(rawHyp)) {
      let aggregated: LegacyAgentMode = 'single';
      for (const mid of asStringArray(h.modelNodeIds)) {
        const prof = modelProfiles[mid];
        if (prof?.agentMode === 'agentic') aggregated = 'agentic';
      }
      const laneThinking = (h as { thinkingLevel?: string }).thinkingLevel ?? 'minimal';

      for (const mid of asStringArray(h.modelNodeIds)) {
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
        modelNodeIds: asStringArray(h.modelNodeIds),
        designSystemNodeIds: h.designSystemNodeIds,
        placeholder: h.placeholder,
        agentMode: aggregated,
      } as PersistedHypothesis & { agentMode: LegacyAgentMode };
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
        inputNodeIds: asStringArray(w.sectionNodeIds).length > 0
          ? asStringArray(w.sectionNodeIds)
          : asStringArray(w.inputNodeIds),
        previewNodeIds: (w.previewNodeIds as string[] | undefined) ?? (w.variantNodeIds as string[] | undefined) ?? [],
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
    const hypotheses: Record<string, PersistedHypothesis> = {};
    for (const [hid, h] of Object.entries(rawHyp)) {
      hypotheses[hid] = {
        ...h,
        strategyId: (h.strategyId ?? h.variantStrategyId) as string,
      } as PersistedHypothesis;
      delete (hypotheses[hid] as unknown as Record<string, unknown>).variantStrategyId;
    }
    p = { ...p, hypotheses };

    const rawW = (p.incubatorWirings as Record<string, Record<string, unknown>>) ?? {};
    const incubatorWirings: Record<string, DomainIncubatorWiring> = {};
    for (const [k, w] of Object.entries(rawW)) {
      incubatorWirings[k] = {
        inputNodeIds: asStringArray(w.sectionNodeIds).length > 0
          ? asStringArray(w.sectionNodeIds)
          : asStringArray(w.inputNodeIds),
        previewNodeIds: (w.previewNodeIds as string[] | undefined) ?? (w.variantNodeIds as string[] | undefined) ?? [],
      };
    }
    p = { ...p, incubatorWirings };
  }
  if (fromVersion < 7) {
    const rawW = (p.incubatorWirings as Record<string, Record<string, unknown>>) ?? {};
    const incubatorWirings: Record<string, DomainIncubatorWiring> = {};
    for (const [k, w] of Object.entries(rawW)) {
      const inputNodeIds =
        asStringArray(w.inputNodeIds).length > 0
          ? asStringArray(w.inputNodeIds)
          : asStringArray(w.sectionNodeIds);
      incubatorWirings[k] = {
        inputNodeIds,
        previewNodeIds: (w.previewNodeIds as string[] | undefined) ?? [],
      };
    }
    p = { ...p, incubatorWirings };
  }
  if (fromVersion < 8) {
    const rawHyp = (p.hypotheses as Record<string, Record<string, unknown>>) ?? {};
    const hypotheses: Record<string, PersistedHypothesis> = {};
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
      } as PersistedHypothesis;
    }
    p = { ...p, hypotheses };
  }
  if (fromVersion < 9) {
    const rawHyp = (p.hypotheses as Record<string, PersistedHypothesis>) ?? {};
    const hypotheses: Record<string, PersistedHypothesis> = {};
    for (const [hid, h] of Object.entries(rawHyp)) {
      hypotheses[hid] = {
        ...h,
        modelNodeIds: asStringArray(h.modelNodeIds).slice(0, 1),
      };
    }
    p = { ...p, hypotheses };
  }
  if (fromVersion < 10) {
    const rawW = (p.incubatorWirings as Record<string, Record<string, unknown>>) ?? {};
    const incubatorWirings: Record<string, DomainIncubatorWiring> = {};
    for (const [k, w] of Object.entries(rawW)) {
      incubatorWirings[k] = {
        inputNodeIds: asStringArray(w.inputNodeIds),
        previewNodeIds: (w.previewNodeIds as string[] | undefined) ?? [],
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
        inputNodeIds: asStringArray(w.inputNodeIds).filter((id) => !id.startsWith('existingDesign')),
      };
    }
    p = { ...p, incubatorWirings };
  }
  if (fromVersion < 12) {
    // Drop Model-node fields that survived Phase 7 D as inert dead weight.
    delete p.incubatorModelNodeIds;
    delete p.modelProfiles;
    if (isRecord(p.hypotheses)) {
      const hypotheses: Record<string, PersistedHypothesis> = {};
      for (const [hid, h] of Object.entries(p.hypotheses)) {
        if (!isRecord(h)) continue;
        const copy = { ...h };
        delete copy.modelNodeIds;
        hypotheses[hid] = copy as unknown as PersistedHypothesis;
      }
      p = { ...p, hypotheses };
    }
  }
  return normalizeWorkspaceDomainPersistShape(p);
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeIncubatorWirings(value: unknown): Record<string, DomainIncubatorWiring> {
  const raw = recordOrEmpty(value);
  const wirings: Record<string, DomainIncubatorWiring> = {};
  for (const [id, wiring] of Object.entries(raw)) {
    if (!isRecord(wiring)) continue;
    wirings[id] = {
      inputNodeIds: Array.isArray(wiring.inputNodeIds)
        ? wiring.inputNodeIds.filter((v): v is string => typeof v === 'string')
        : [],
      previewNodeIds: Array.isArray(wiring.previewNodeIds)
        ? wiring.previewNodeIds.filter((v): v is string => typeof v === 'string')
        : [],
    };
  }
  return wirings;
}

function normalizeWorkspaceDomainPersistShape(p: Record<string, unknown>): Record<string, unknown> {
  return {
    ...p,
    incubatorWirings: normalizeIncubatorWirings(p.incubatorWirings),
    hypotheses: recordOrEmpty(p.hypotheses),
    designSystems: recordOrEmpty(p.designSystems),
    previewSlots: recordOrEmpty(p.previewSlots),
  };
}
