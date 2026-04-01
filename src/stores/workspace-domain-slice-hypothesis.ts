import {
  variantSlotKey,
  type DomainHypothesis,
  type DomainVariantSlot,
} from '../types/workspace-domain';
import { uniqPush, removeId } from './workspace-domain-helpers';
import type { WorkspaceDomainStore } from './workspace-domain-store-types';

type DomainSet = (
  partial:
    | Partial<WorkspaceDomainStore>
    | ((state: WorkspaceDomainStore) => Partial<WorkspaceDomainStore> | WorkspaceDomainStore),
) => void;

export function createWorkspaceDomainHypothesisSlice(set: DomainSet): Pick<
  WorkspaceDomainStore,
  | 'attachDesignSystemToHypothesis'
  | 'detachDesignSystemFromHypothesis'
  | 'linkHypothesisToIncubator'
  | 'setHypothesisGenerationSettings'
  | 'setHypothesisPlaceholder'
  | 'removeHypothesis'
  | 'removeIncubator'
  | 'setVariantSlot'
  | 'removeVariantSlot'
> {
  return {
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
  };
}
