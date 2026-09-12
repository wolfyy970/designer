/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import type { NodeProps, Node } from '@xyflow/react';
import IncubatorNode from '../IncubatorNode';
import { useSpecStore } from '../../../../stores/spec-store';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { useIncubatorStore } from '../../../../stores/incubator-store';
import { useWorkspaceDomainStore } from '../../../../stores/workspace-domain-store';
import type { IncubatorNodeData } from '../../../../types/canvas-data';

const apiMocks = vi.hoisted(() => ({
  extractDesignSystem: vi.fn(),
  generateInternalContext: vi.fn(),
  incubateStream: vi.fn(),
}));

vi.mock('../../../../api/client', () => apiMocks);

vi.mock('@radix-ui/react-slot', () => ({
  Slot: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ fitView: vi.fn() }),
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

vi.mock('../../../../hooks/useTaskModel', () => ({
  useTaskModel: () => ({
    providerId: 'openrouter',
    modelId: 'test-model',
    hasModel: true,
    supportsVision: false,
    supportsReasoning: false,
  }),
}));

vi.mock('../../../../hooks/useCanvasNodePermanentRemove', () => ({
  useCanvasNodePermanentRemove: () => () => {},
}));

type IncubatorNodeFlowType = Node<IncubatorNodeData, 'incubator'>;

function minimalIncubatorProps(): NodeProps<IncubatorNodeFlowType> {
  return {
    id: 'inc-1',
    data: {},
    selected: false,
    type: 'incubator',
    isConnectable: true,
    zIndex: 0,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as NodeProps<IncubatorNodeFlowType>;
}

afterEach(() => cleanup());

describe('IncubatorNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.extractDesignSystem.mockResolvedValue({
      result: '---\nname: Generated\ncolors:\n  primary: "#111111"\n---\n# Generated',
      lint: { errors: 0, warnings: 0, infos: 0, findings: [] },
    });
    apiMocks.generateInternalContext.mockResolvedValue({ result: '# Context' });
    apiMocks.incubateStream.mockResolvedValue({
      id: 'plan-1',
      specId: 'spec-1',
      dimensions: [],
      hypotheses: [],
      generatedAt: '2026-01-01T00:00:00Z',
      incubatorModel: 'test-model',
    });
    useWorkspaceDomainStore.getState().reset();
    useIncubatorStore.getState().reset();
    useCanvasStore.getState().reset();
    useSpecStore.getState().createNewCanvas('Test canvas');
    useSpecStore.getState().resetSectionContent('design-brief');
  });

  it('disables Generate and blank hypothesis when Design Brief is empty', () => {
    render(<IncubatorNode {...minimalIncubatorProps()} />);
    const gen = screen.getByRole('button', { name: /Generate hypotheses/ }) as HTMLButtonElement;
    const blank = screen.getByRole('button', { name: /Add blank hypothesis card/ }) as HTMLButtonElement;
    expect(gen.disabled).toBe(true);
    expect(blank.disabled).toBe(true);
  });

  it('enables Generate when Design Brief has content and model is connected (mocked)', () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    render(<IncubatorNode {...minimalIncubatorProps()} />);
    const gen = screen.getByRole('button', { name: /Generate hypotheses/ }) as HTMLButtonElement;
    const blank = screen.getByRole('button', { name: /Add blank hypothesis card/ }) as HTMLButtonElement;
    expect(gen.disabled).toBe(false);
    expect(blank.disabled).toBe(false);
  });

  it('counts active Incubator sources without treating Design System as Incubator input', () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    useCanvasStore.setState({
      nodes: [
        { id: 'inc-1', type: 'incubator', position: { x: 0, y: 0 }, data: {} },
        { id: 'brief-1', type: 'designBrief', position: { x: 0, y: 0 }, data: {} },
        { id: 'ds-1', type: 'designSystem', position: { x: 0, y: 0 }, data: { sourceMode: 'wireframe' } },
      ],
      edges: [
        { id: 'e-brief-inc', source: 'brief-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } },
        { id: 'e-ds-inc', source: 'ds-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } },
      ],
    });

    render(<IncubatorNode {...minimalIncubatorProps()} />);

    expect(screen.getByText('1 source connected')).toBeTruthy();
    expect(screen.queryByText('DESIGN.md')).toBeNull();
  });

  it('uses an in-canvas count control that updates hypothesisCount', () => {
    useCanvasStore.setState({
      nodes: [{ id: 'inc-1', type: 'incubator', position: { x: 0, y: 0 }, data: { hypothesisCount: 3 } }],
      edges: [],
    });

    render(<IncubatorNode {...minimalIncubatorProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'New hypotheses' }));
    fireEvent.click(screen.getByRole('option', { name: /5/ }));

    expect(useCanvasStore.getState().nodes.find((n) => n.id === 'inc-1')?.data.hypothesisCount).toBe(5);
  });
});
