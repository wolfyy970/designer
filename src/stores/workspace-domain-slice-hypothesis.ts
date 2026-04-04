import { GENERATION_MODE } from '../constants/generation';
import {
  previewSlotKey,
  type DomainHypothesis,
  type DomainPreviewSlot,
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
  | 'setPreviewSlot'
  | 'removePreviewSlot'
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

    linkHypothesisToIncubator: (hypothesisId, incubatorId, strategyId) =>
      set((s) => {
        const prev = s.hypotheses[hypothesisId];
        const next: DomainHypothesis = {
          id: hypothesisId,
          incubatorId,
          strategyId,
          modelNodeIds: prev?.modelNodeIds ?? [],
          designSystemNodeIds: prev?.designSystemNodeIds ?? [],
          agentMode: prev?.agentMode ?? GENERATION_MODE.SINGLE,
          placeholder: prev?.placeholder ?? false,
        };
        const k = previewSlotKey(hypothesisId, strategyId);
        const slot: DomainPreviewSlot = s.previewSlots[k] ?? {
          hypothesisId,
          strategyId,
          previewNodeId: null,
          activeResultId: null,
          pinnedRunId: null,
        };
        return {
          hypotheses: { ...s.hypotheses, [hypothesisId]: next },
          previewSlots: { ...s.previewSlots, [k]: slot },
        };
      }),

    setHypothesisGenerationSettings: (hypothesisId, partial) =>
      set((s) => {
        const h = s.hypotheses[hypothesisId];
        if (!h) return s;
        if (!('agentMode' in partial)) return s;
        return {
          hypotheses: {
            ...s.hypotheses,
            [hypothesisId]: {
              ...h,
              agentMode: partial.agentMode,
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
        const vs = { ...s.previewSlots };
        for (const k of Object.keys(vs)) {
          if (k.startsWith(`${hypothesisId}::`)) delete vs[k];
        }
        return { hypotheses: restH, previewSlots: vs };
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

    setPreviewSlot: (hypothesisId, strategyId, partial) =>
      set((s) => {
        const k = previewSlotKey(hypothesisId, strategyId);
        const cur = s.previewSlots[k] ?? {
          hypothesisId,
          strategyId,
          previewNodeId: null,
          activeResultId: null,
          pinnedRunId: null,
        };
        return { previewSlots: { ...s.previewSlots, [k]: { ...cur, ...partial } } };
      }),

    removePreviewSlot: (hypothesisId, strategyId) =>
      set((s) => {
        const k = previewSlotKey(hypothesisId, strategyId);
        const rest = { ...s.previewSlots };
        delete rest[k];
        return { previewSlots: rest };
      }),
  };
}
