/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { NodeProps, Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NODE_TYPES, INPUT_GHOST_NODE_TYPE } from '../../../../constants/canvas';
import { useCanvasStore } from '../../../../stores/canvas-store';
import type { InputGhostData } from '../../../../types/canvas-data';
import InputGhostNode from '../InputGhostNode';

type InputGhostFlowNode = Node<InputGhostData, typeof INPUT_GHOST_NODE_TYPE>;

function ghostProps(): NodeProps<InputGhostFlowNode> {
  return {
    id: 'ghost-input-researchContext',
    type: INPUT_GHOST_NODE_TYPE,
    data: { targetType: NODE_TYPES.RESEARCH_CONTEXT },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as NodeProps<InputGhostFlowNode>;
}

afterEach(() => cleanup());

describe('InputGhostNode', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  it('requests viewport focus for the real node created from the ghost', () => {
    render(<InputGhostNode {...ghostProps()} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: /add research & context/i }));

    const state = useCanvasStore.getState();
    const materialized = state.nodes.find((node) => node.type === NODE_TYPES.RESEARCH_CONTEXT);
    expect(materialized).toBeDefined();
    expect(state.pendingFocusNodeId).toBe(materialized?.id);
  });
});
