/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';
import IncubatorNode from '../IncubatorNode';
import { useSpecStore } from '../../../../stores/spec-store';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { useIncubatorStore } from '../../../../stores/incubator-store';
import { useWorkspaceDomainStore } from '../../../../stores/workspace-domain-store';

vi.mock('@radix-ui/react-slot', () => ({
  Slot: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ fitView: vi.fn() }),
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

vi.mock('../../../../hooks/useConnectedModel', () => ({
  useConnectedModel: () => ({
    providerId: 'openrouter',
    modelId: 'test-model',
    supportsVision: false,
    supportsReasoning: false,
    isConnected: true,
  }),
}));

vi.mock('../../../../hooks/useCanvasNodePermanentRemove', () => ({
  useCanvasNodePermanentRemove: () => () => {},
}));

function minimalIncubatorProps(): NodeProps<{ data: Record<string, unknown>; id: string; type: string }> {
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
  } as NodeProps<{ data: Record<string, unknown>; id: string; type: string }>;
}

afterEach(() => cleanup());

describe('IncubatorNode', () => {
  beforeEach(() => {
    useWorkspaceDomainStore.getState().reset();
    useIncubatorStore.getState().reset();
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ autoLayout: false });
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
});
