import { describe, it, expect, beforeEach } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { useCanvasStore } from '../canvas-store';
import { useCompilerStore } from '../compiler-store';
import { useWorkspaceDomainStore } from '../workspace-domain-store';
import type { DimensionMap } from '../../types/compiler';
import type { WorkspaceNode } from '../../types/workspace-graph';

function minimalMap(variantId: string): DimensionMap {
  return {
    id: 'm1',
    specId: 's1',
    dimensions: [],
    variants: [
      {
        id: variantId,
        name: 'V',
        hypothesis: '',
        rationale: '',
        measurements: '',
        dimensionValues: {},
      },
    ],
    generatedAt: '2020-01-01',
    compilerModel: 'x',
  };
}

describe('canvas-store removeNode (hypothesis)', () => {
  beforeEach(() => {
    useWorkspaceDomainStore.getState().reset();
    useCompilerStore.getState().reset();
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ autoLayout: false });
  });

  it('removes variant strategy from compiler store and clears domain hypothesis', () => {
    const compiler: WorkspaceNode = {
      id: 'c1',
      type: NODE_TYPES.COMPILER,
      position: { x: 0, y: 0 },
      data: {},
    };
    const hypothesis: WorkspaceNode = {
      id: 'h1',
      type: NODE_TYPES.HYPOTHESIS,
      position: { x: 0, y: 0 },
      data: { refId: 'vs1' },
    };

    useWorkspaceDomainStore.setState({
      hypotheses: {
        h1: {
          id: 'h1',
          incubatorId: 'c1',
          variantStrategyId: 'vs1',
          modelNodeIds: [],
          designSystemNodeIds: [],
          placeholder: false,
        },
      },
    });
    useCompilerStore.setState({ dimensionMaps: { c1: minimalMap('vs1') } });
    useCanvasStore.setState({ nodes: [compiler, hypothesis], edges: [], autoLayout: false });

    useCanvasStore.getState().removeNode('h1');

    expect(useCompilerStore.getState().dimensionMaps.c1?.variants ?? []).toEqual([]);
    expect(useWorkspaceDomainStore.getState().hypotheses.h1).toBeUndefined();
  });
});
