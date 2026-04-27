import { describe, it, expect, beforeEach } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { useCanvasStore } from '../canvas-store';
import type { WorkspaceNode } from '../../types/workspace-graph';

describe('canvas-store smoke', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
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

  it('does not remove required structural nodes', () => {
    const required: WorkspaceNode[] = [
      { id: 'brief-1', type: NODE_TYPES.DESIGN_BRIEF, position: { x: 0, y: 0 }, data: {} },
      { id: 'model-1', type: NODE_TYPES.MODEL, position: { x: 0, y: 0 }, data: {} },
      { id: 'inc-1', type: NODE_TYPES.INCUBATOR, position: { x: 0, y: 0 }, data: {} },
      { id: 'ghost-input-researchContext', type: 'inputGhost', position: { x: 0, y: 0 }, data: { targetType: 'researchContext' } },
    ];
    useCanvasStore.setState({ nodes: required, edges: [] });

    for (const node of required) {
      useCanvasStore.getState().removeNode(node.id);
    }

    expect(useCanvasStore.getState().nodes.map((n) => n.id)).toEqual(required.map((n) => n.id));
  });

  it('removing an optional input restores its ghost card', () => {
    useCanvasStore.setState({
      nodes: [
        { id: 'brief-1', type: NODE_TYPES.DESIGN_BRIEF, position: { x: 0, y: 0 }, data: {} },
        { id: 'research-1', type: NODE_TYPES.RESEARCH_CONTEXT, position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [],
    });

    useCanvasStore.getState().removeNode('research-1');

    const nodes = useCanvasStore.getState().nodes;
    expect(nodes.some((n) => n.id === 'research-1')).toBe(false);
    expect(nodes.some((n) => n.type === 'inputGhost' && n.data.targetType === NODE_TYPES.RESEARCH_CONTEXT)).toBe(true);
  });
});
