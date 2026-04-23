import { describe, it, expect, beforeEach } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { useCanvasStore } from '../canvas-store';
import { useIncubatorStore } from '../incubator-store';
import { useWorkspaceDomainStore } from '../workspace-domain-store';

describe('canvas-store addNode (hypothesis)', () => {
  beforeEach(() => {
    useWorkspaceDomainStore.getState().reset();
    useIncubatorStore.getState().reset();
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ autoLayout: false });
  });

  it('wires a new hypothesis to the sole incubator via an edge', () => {
    useCanvasStore.setState({
      nodes: [
        { id: 'c1', type: NODE_TYPES.INCUBATOR, position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
      autoLayout: false,
    });
    const newId = useCanvasStore.getState().addNode(NODE_TYPES.HYPOTHESIS);
    expect(newId).toBeDefined();
    const { nodes, edges } = useCanvasStore.getState();
    expect(nodes.some((n) => n.id === newId && n.type === NODE_TYPES.HYPOTHESIS)).toBe(true);
    expect(edges.some((e) => e.source === 'c1' && e.target === newId)).toBe(true);
  });
});
