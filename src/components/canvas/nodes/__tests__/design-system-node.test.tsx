/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';
import DesignSystemNode from '../DesignSystemNode';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { computeDesignMdSourceHash } from '../../../../lib/design-md';

vi.mock('@radix-ui/react-slot', () => ({
  Slot: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

vi.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}));

vi.mock('../../../../hooks/useConnectedModel', () => ({
  useConnectedModel: () => ({
    providerId: 'openrouter',
    modelId: 'test-model',
    supportsVision: true,
  }),
}));

vi.mock('../../../../hooks/useCanvasNodePermanentRemove', () => ({
  useCanvasNodePermanentRemove: () => () => {},
}));

function props(data: Record<string, unknown> = {}): NodeProps<{ data: Record<string, unknown>; id: string; type: string }> {
  return {
    id: 'ds-1',
    data,
    selected: false,
    type: 'designSystem',
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

describe('DesignSystemNode', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  afterEach(() => cleanup());

  it('prompts users to prefer DESIGN.md source format', () => {
    render(<DesignSystemNode {...props()} />);
    expect(screen.getByPlaceholderText(/Preferred format: DESIGN\.md/)).toBeTruthy();
  });

  it('shows ready status for a current DESIGN.md document', () => {
    const source = { title: 'Brand DS', content: 'Use red buttons.', images: [] };
    const sourceHash = computeDesignMdSourceHash(source);
    render(<DesignSystemNode {...props({
      ...source,
      designMdDocument: {
        content: '---\nname: Brand\n---\n# Brand',
        sourceHash,
        generatedAt: '2026-01-01T00:00:00Z',
        providerId: 'openrouter',
        modelId: 'test-model',
      },
    })} />);
    expect(screen.getByText('DESIGN.md')).toBeTruthy();
    expect(screen.getByText('ready')).toBeTruthy();
  });
});

