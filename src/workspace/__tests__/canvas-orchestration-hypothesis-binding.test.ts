import { describe, it, expect, beforeEach } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { ensureHypothesisStrategyBinding } from '../canvas-orchestration';
import { useIncubatorStore } from '../../stores/incubator-store';
import { useWorkspaceDomainStore } from '../../stores/workspace-domain-store';
import { useSpecStore } from '../../stores/spec-store';
import type { WorkspaceNode } from '../../types/workspace-graph';
import type { WorkspaceEdge } from '../../types/workspace-graph';
import { EDGE_STATUS, EDGE_TYPES } from '../../constants/canvas';

describe('ensureHypothesisStrategyBinding', () => {
  beforeEach(() => {
    useIncubatorStore.getState().reset();
    useWorkspaceDomainStore.getState().reset();
    useSpecStore.getState().createNewCanvas('test-binding');
  });

  it('appends a new strategy row and never reuses the previous strategy id (fresh getState after add)', () => {
    const specId = useSpecStore.getState().spec.id;
    const compiler: WorkspaceNode = {
      id: 'c1',
      type: NODE_TYPES.INCUBATOR,
      position: { x: 0, y: 0 },
      data: {},
    };
    const hypothesis: WorkspaceNode = {
      id: 'h-new',
      type: NODE_TYPES.HYPOTHESIS,
      position: { x: 0, y: 0 },
      data: {},
    };
    useIncubatorStore.getState().setPlanForNode('c1', {
      id: 'plan1',
      specId,
      dimensions: [],
      hypotheses: [
        {
          id: 'vs-preexisting',
          name: 'Already on canvas',
          hypothesis: 'Existing incubated copy',
          rationale: '',
          measurements: '',
          dimensionValues: {},
        },
      ],
      generatedAt: '2020-01-01',
      incubatorModel: 'x',
    });

    const edges: WorkspaceEdge[] = [
      {
        id: 'e-c1-h-new',
        source: 'c1',
        target: 'h-new',
        type: EDGE_TYPES.DATA_FLOW,
        data: { status: EDGE_STATUS.IDLE },
      },
    ];

    const refId = ensureHypothesisStrategyBinding('h-new', [compiler, hypothesis], edges);
    expect(refId).toBeDefined();
    expect(refId).not.toBe('vs-preexisting');

    const plan = useIncubatorStore.getState().incubationPlans.c1!;
    expect(plan.hypotheses).toHaveLength(2);
    const added = plan.hypotheses.find((h) => h.id === refId);
    expect(added?.name).toBe('New Hypothesis');
    expect(added?.hypothesis).toBe('');

    const domain = useWorkspaceDomainStore.getState().hypotheses['h-new'];
    expect(domain?.strategyId).toBe(refId);
    expect(domain?.incubatorId).toBe('c1');
  });
});
