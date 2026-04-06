import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { GENERATION_STATUS } from '../../constants/generation';
import {
  collectOrphanNodeIds,
  pruneIncubationPlansToLinkedRefIds,
  staleGeneratingResultIds,
} from '../canvas-graph-cleanup';
import type { IncubationPlan } from '../../types/incubator';
import type { GenerationResult } from '../../types/provider';
import type { WorkspaceNode } from '../../types/workspace-graph';

function mapWithStrategies(ids: string[]): Record<string, IncubationPlan> {
  return {
    c1: {
      id: 'm1',
      specId: 's',
      dimensions: [],
      hypotheses: ids.map((id) => ({
        id,
        name: id,
        hypothesis: '',
        rationale: '',
        measurements: '',
        dimensionValues: {},
      })),
      generatedAt: 'x',
      incubatorModel: '',
    },
  };
}

function hypo(id: string, refId: string, placeholder = false): WorkspaceNode {
  return {
    id,
    type: NODE_TYPES.HYPOTHESIS,
    position: { x: 0, y: 0 },
    data: { refId, ...(placeholder ? { placeholder: true } : {}) },
  };
}

describe('canvas-graph-cleanup', () => {
  it('collectOrphanNodeIds flags hypothesis when strategy missing from plans', () => {
    const nodes: WorkspaceNode[] = [hypo('h1', 'vs-missing')];
    const plans = mapWithStrategies(['vs-other']);
    const results: GenerationResult[] = [];
    const ids = collectOrphanNodeIds(nodes, plans, results, false);
    expect(ids.has('h1')).toBe(true);
  });

  it('pruneIncubationPlansToLinkedRefIds drops unlinked strategies', () => {
    const nodes: WorkspaceNode[] = [hypo('h1', 'vs-keep')];
    const plans = mapWithStrategies(['vs-keep', 'vs-orphan']);
    const { nextMaps, changed } = pruneIncubationPlansToLinkedRefIds(nodes, plans);
    expect(changed).toBe(true);
    expect(nextMaps.c1?.hypotheses.map((v) => v.id)).toEqual(['vs-keep']);
  });

  it('staleGeneratingResultIds is empty while generating', () => {
    const results: GenerationResult[] = [
      {
        id: 'r1',
        strategyId: 'vs',
        providerId: 'p',
        status: GENERATION_STATUS.GENERATING,
        runId: 'run',
        runNumber: 1,
        metadata: { model: 'm' },
      },
    ];
    expect(staleGeneratingResultIds(results, true)).toEqual([]);
    expect(staleGeneratingResultIds(results, false)).toEqual(['r1']);
  });
});
