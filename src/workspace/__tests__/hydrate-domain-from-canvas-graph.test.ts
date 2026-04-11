import { describe, it, expect, beforeEach } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { useWorkspaceDomainStore } from '../../stores/workspace-domain-store';
import { hydrateDomainFromCanvasGraph } from '../hydrate-domain-from-canvas-graph';

describe('hydrateDomainFromCanvasGraph', () => {
  beforeEach(() => {
    useWorkspaceDomainStore.getState().reset();
  });

  it('keeps the first model→hypothesis edge when duplicates exist on the graph', () => {
    hydrateDomainFromCanvasGraph({
      nodes: [
        { id: 'm1', type: NODE_TYPES.MODEL, data: { modelId: 'a', providerId: 'openrouter' } },
        { id: 'm2', type: NODE_TYPES.MODEL, data: { modelId: 'b', providerId: 'openrouter' } },
        { id: 'h1', type: NODE_TYPES.HYPOTHESIS, data: { refId: 'vs1' } },
        { id: 'c1', type: NODE_TYPES.INCUBATOR, data: {} },
      ],
      edges: [
        { source: 'c1', target: 'h1' },
        { source: 'm1', target: 'h1' },
        { source: 'm2', target: 'h1' },
      ],
    });
    expect(useWorkspaceDomainStore.getState().hypotheses.h1?.modelNodeIds).toEqual(['m1']);
  });
});
