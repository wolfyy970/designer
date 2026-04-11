import { describe, it, expect, beforeEach } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { useCanvasStore } from '../canvas-store';
import type { WorkspaceNode } from '../../types/workspace-graph';

describe('canvas-store smoke', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ autoLayout: false });
  });

  it('accepts a minimal node list and exposes graph state', () => {
    const model: WorkspaceNode = {
      id: 'model-1',
      type: NODE_TYPES.MODEL,
      position: { x: 0, y: 0 },
      data: { providerId: 'openrouter', modelId: 'm' },
    };
    useCanvasStore.setState({ nodes: [model], edges: [] });
    const { nodes, edges } = useCanvasStore.getState();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.type).toBe(NODE_TYPES.MODEL);
    expect(edges).toEqual([]);
  });
});
