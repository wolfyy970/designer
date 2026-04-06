import { describe, it, expect, beforeEach } from 'vitest';
import { EDGE_STATUS, EDGE_TYPES, NODE_TYPES } from '../../constants/canvas';
import { useCanvasStore } from '../canvas-store';
import { useIncubatorStore } from '../incubator-store';
import { useWorkspaceDomainStore } from '../workspace-domain-store';
import type { HypothesisStrategy } from '../../types/incubator';
import type { WorkspaceNode } from '../../types/workspace-graph';
import { HYPOTHESIS_STACK_GAP } from '../canvas/hypothesis-layout-constants';

function strategy(id: string): HypothesisStrategy {
  return {
    id,
    name: 'S',
    hypothesis: '',
    rationale: '',
    measurements: '',
    dimensionValues: {},
  };
}

describe('canvas-store syncAfterIncubate', () => {
  beforeEach(() => {
    useWorkspaceDomainStore.getState().reset();
    useIncubatorStore.getState().reset();
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ autoLayout: false });
  });

  it('is a no-op for an empty strategy list', () => {
    const incubator: WorkspaceNode = {
      id: 'inc1',
      type: NODE_TYPES.INCUBATOR,
      position: { x: 0, y: 0 },
      data: {},
    };
    useCanvasStore.setState({ nodes: [incubator], edges: [] });
    useCanvasStore.getState().syncAfterIncubate([], 'inc1');
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
  });

  it('adds hypothesis nodes, incubator edges, and domain links for new strategies', () => {
    const incubatorY = 400;
    const incubator: WorkspaceNode = {
      id: 'inc1',
      type: NODE_TYPES.INCUBATOR,
      position: { x: 0, y: incubatorY },
      data: {},
    };
    useCanvasStore.setState({ nodes: [incubator], edges: [] });

    useCanvasStore.getState().syncAfterIncubate([strategy('st-a'), strategy('st-b')], 'inc1');

    const { nodes, edges } = useCanvasStore.getState();
    const hyps = nodes.filter((n) => n.type === NODE_TYPES.HYPOTHESIS);
    expect(hyps).toHaveLength(2);
    expect(new Set(hyps.map((n) => n.data.refId))).toEqual(new Set(['st-a', 'st-b']));

    const byRef = new Map(hyps.map((h) => [h.data.refId!, h]));
    expect(byRef.get('st-a')!.id).toBe('hypothesis-st-a');
    expect(byRef.get('st-b')!.id).toBe('hypothesis-st-b');

    for (const h of hyps) {
      expect(edges.some((e) => e.source === 'inc1' && e.target === h.id)).toBe(true);
    }

    expect(byRef.get('st-a')!.position.y).toBeGreaterThan(incubatorY + HYPOTHESIS_STACK_GAP - 1);

    const domain = useWorkspaceDomainStore.getState();
    expect(domain.hypotheses['hypothesis-st-a']?.incubatorId).toBe('inc1');
    expect(domain.hypotheses['hypothesis-st-a']?.strategyId).toBe('st-a');
    expect(domain.hypotheses['hypothesis-st-a']?.placeholder).toBe(false);
    expect(domain.hypotheses['hypothesis-st-b']?.incubatorId).toBe('inc1');
    expect(domain.hypotheses['hypothesis-st-b']?.strategyId).toBe('st-b');
  });

  it('does not duplicate hypothesis nodes for strategies already present by refId', () => {
    const incubator: WorkspaceNode = {
      id: 'inc1',
      type: NODE_TYPES.INCUBATOR,
      position: { x: 0, y: 0 },
      data: {},
    };
    const existing: WorkspaceNode = {
      id: 'h-prior',
      type: NODE_TYPES.HYPOTHESIS,
      position: { x: 10, y: 20 },
      data: { refId: 'already' },
    };
    useCanvasStore.setState({
      nodes: [incubator, existing],
      edges: [
        {
          id: 'e-inc-h',
          source: 'inc1',
          target: 'h-prior',
          type: EDGE_TYPES.DATA_FLOW,
          data: { status: EDGE_STATUS.COMPLETE },
        },
      ],
    });

    useCanvasStore.getState().syncAfterIncubate([strategy('already'), strategy('fresh')], 'inc1');

    const hyps = useCanvasStore.getState().nodes.filter((n) => n.type === NODE_TYPES.HYPOTHESIS);
    expect(hyps).toHaveLength(2);
    expect(hyps.some((n) => n.id === 'hypothesis-fresh')).toBe(true);
    expect(hyps.filter((n) => n.data.refId === 'already')).toHaveLength(1);
  });
});
