import { describe, it, expect, beforeEach } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { useWorkspaceDomainStore } from '../../stores/workspace-domain-store';
import { hydrateDomainFromCanvasGraph } from '../hydrate-domain-from-canvas-graph';

describe('hydrateDomainFromCanvasGraph', () => {
  beforeEach(() => {
    useWorkspaceDomainStore.getState().reset();
  });

  it('hydrates the incubator/hypothesis link without populating modelNodeIds (Settings is the model source)', () => {
    hydrateDomainFromCanvasGraph({
      nodes: [
        { id: 'm1', type: NODE_TYPES.MODEL, data: { modelId: 'a', providerId: 'openrouter' } },
        { id: 'h1', type: NODE_TYPES.HYPOTHESIS, data: { refId: 'vs1' } },
        { id: 'c1', type: NODE_TYPES.INCUBATOR, data: {} },
      ],
      edges: [
        { source: 'c1', target: 'h1' },
        { source: 'm1', target: 'h1' },
      ],
    });
    const h1 = useWorkspaceDomainStore.getState().hypotheses.h1;
    expect(h1?.incubatorId).toBe('c1');
  });
});
