import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { GENERATION_STATUS } from '../../constants/generation';
import {
  collectOrphanNodeIds,
  pruneDimensionMapsToLinkedRefIds,
  staleGeneratingResultIds,
} from '../canvas-orchestrator';
import type { DimensionMap } from '../../types/compiler';
import type { GenerationResult } from '../../types/provider';
import type { WorkspaceNode } from '../../types/workspace-graph';

function mapWithVariants(ids: string[]): Record<string, DimensionMap> {
  return {
    c1: {
      id: 'm1',
      specId: 's',
      dimensions: [],
      variants: ids.map((id) => ({
        id,
        name: id,
        hypothesis: '',
        rationale: '',
        measurements: '',
        dimensionValues: {},
      })),
      generatedAt: 'x',
      compilerModel: '',
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

describe('canvas-orchestrator', () => {
  it('collectOrphanNodeIds flags hypothesis when strategy missing from maps', () => {
    const nodes: WorkspaceNode[] = [hypo('h1', 'vs-missing')];
    const maps = mapWithVariants(['vs-other']);
    const results: GenerationResult[] = [];
    const ids = collectOrphanNodeIds(nodes, maps, results, false);
    expect(ids.has('h1')).toBe(true);
  });

  it('pruneDimensionMapsToLinkedRefIds drops unlinked strategies', () => {
    const nodes: WorkspaceNode[] = [hypo('h1', 'vs-keep')];
    const maps = mapWithVariants(['vs-keep', 'vs-orphan']);
    const { nextMaps, changed } = pruneDimensionMapsToLinkedRefIds(nodes, maps);
    expect(changed).toBe(true);
    expect(nextMaps.c1?.variants.map((v) => v.id)).toEqual(['vs-keep']);
  });

  it('staleGeneratingResultIds is empty while generating', () => {
    const results: GenerationResult[] = [
      {
        id: 'r1',
        variantStrategyId: 'vs',
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
