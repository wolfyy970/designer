import { describe, it, expect, beforeEach } from 'vitest';
import { EDGE_STATUS, EDGE_TYPES, NODE_TYPES } from '../../constants/canvas';
import { useCanvasStore } from '../canvas-store';
import { useCompilerStore } from '../compiler-store';
import { useWorkspaceDomainStore } from '../workspace-domain-store';
import type { DimensionMap } from '../../types/compiler';
import type { WorkspaceEdge, WorkspaceNode } from '../../types/workspace-graph';
import { variantSlotKey } from '../../types/workspace-domain';
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

describe('canvas-store removeNode (variant)', () => {
  beforeEach(() => {
    useWorkspaceDomainStore.getState().reset();
    useCompilerStore.getState().reset();
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ autoLayout: false });
  });

  it('clears domain variant slot and UI pointers so the node does not stay wired', () => {
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
    const variant: WorkspaceNode = {
      id: 'v1',
      type: NODE_TYPES.VARIANT,
      position: { x: 0, y: 0 },
      data: { variantStrategyId: 'vs1', refId: 'r1' },
    };
    const edges: WorkspaceEdge[] = [
      {
        id: 'c1-h1',
        source: 'c1',
        target: 'h1',
        type: EDGE_TYPES.DATA_FLOW,
        data: { status: EDGE_STATUS.COMPLETE },
      },
      {
        id: 'h1-v1',
        source: 'h1',
        target: 'v1',
        type: EDGE_TYPES.DATA_FLOW,
        data: { status: EDGE_STATUS.COMPLETE },
      },
    ];

    useCompilerStore.getState().setDimensionMapForNode('c1', minimalMap('vs1'));
    const dom = useWorkspaceDomainStore.getState();
    dom.linkHypothesisToIncubator('h1', 'c1', 'vs1');
    dom.setVariantSlot('h1', 'vs1', {
      variantNodeId: 'v1',
      activeResultId: 'r1',
    });

    useCanvasStore.setState({
      nodes: [compiler, hypothesis, variant],
      edges,
      expandedVariantId: 'v1',
      runInspectorVariantNodeId: 'v1',
      variantNodeIdMap: new Map([['vs1', 'v1']]),
    });

    useCanvasStore.getState().removeNode('v1');

    const slot = useWorkspaceDomainStore.getState().variantSlots[variantSlotKey('h1', 'vs1')];
    expect(slot?.variantNodeId).toBeNull();
    expect(slot?.activeResultId).toBeNull();

    const canvas = useCanvasStore.getState();
    expect(canvas.nodes.some((n) => n.id === 'v1')).toBe(false);
    expect(canvas.expandedVariantId).toBeNull();
    expect(canvas.runInspectorVariantNodeId).toBeNull();
    expect(canvas.variantNodeIdMap.has('vs1')).toBe(false);
  });
});
