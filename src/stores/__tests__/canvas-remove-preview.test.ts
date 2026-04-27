import { describe, it, expect, beforeEach } from 'vitest';
import { EDGE_STATUS, EDGE_TYPES, NODE_TYPES } from '../../constants/canvas';
import { useCanvasStore } from '../canvas-store';
import { useIncubatorStore } from '../incubator-store';
import { useWorkspaceDomainStore } from '../workspace-domain-store';
import type { IncubationPlan } from '../../types/incubator';
import type { WorkspaceEdge, WorkspaceNode } from '../../types/workspace-graph';
import { previewSlotKey } from '../../types/workspace-domain';
function minimalPlan(strategyId: string): IncubationPlan {
  return {
    id: 'm1',
    specId: 's1',
    dimensions: [],
    hypotheses: [
      {
        id: strategyId,
        name: 'V',
        hypothesis: '',
        rationale: '',
        measurements: '',
        dimensionValues: {},
      },
    ],
    generatedAt: '2020-01-01',
    incubatorModel: 'x',
  };
}

describe('canvas-store removeNode (preview)', () => {
  beforeEach(() => {
    useWorkspaceDomainStore.getState().reset();
    useIncubatorStore.getState().reset();
    useCanvasStore.getState().reset();
  });

  it('clears domain preview slot and UI pointers so the node does not stay wired', () => {
    const compiler: WorkspaceNode = {
      id: 'c1',
      type: NODE_TYPES.INCUBATOR,
      position: { x: 0, y: 0 },
      data: {},
    };
    const hypothesis: WorkspaceNode = {
      id: 'h1',
      type: NODE_TYPES.HYPOTHESIS,
      position: { x: 0, y: 0 },
      data: { refId: 'vs1' },
    };
    const preview: WorkspaceNode = {
      id: 'v1',
      type: NODE_TYPES.PREVIEW,
      position: { x: 0, y: 0 },
      data: { strategyId: 'vs1', refId: 'r1' },
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

    useIncubatorStore.getState().setPlanForNode('c1', minimalPlan('vs1'));
    const dom = useWorkspaceDomainStore.getState();
    dom.linkHypothesisToIncubator('h1', 'c1', 'vs1');
    dom.setPreviewSlot('h1', 'vs1', {
      previewNodeId: 'v1',
      activeResultId: 'r1',
    });

    useCanvasStore.setState({
      nodes: [compiler, hypothesis, preview],
      edges,
      expandedPreviewId: 'v1',
      runInspectorPreviewNodeId: 'v1',
      previewNodeIdMap: new Map([['vs1', 'v1']]),
    });

    useCanvasStore.getState().removeNode('v1');

    const slot = useWorkspaceDomainStore.getState().previewSlots[previewSlotKey('h1', 'vs1')];
    expect(slot?.previewNodeId).toBeNull();
    expect(slot?.activeResultId).toBeNull();

    const canvas = useCanvasStore.getState();
    expect(canvas.nodes.some((n) => n.id === 'v1')).toBe(false);
    expect(canvas.expandedPreviewId).toBeNull();
    expect(canvas.runInspectorPreviewNodeId).toBeNull();
    expect(canvas.previewNodeIdMap.has('vs1')).toBe(false);
  });
});
