/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';
import DesignSystemNode from '../DesignSystemNode';
import { useCanvasStore } from '../../../../stores/canvas-store';

let latestDropzoneOptions: {
  onDrop?: (files: File[]) => void | Promise<void>;
  onDropRejected?: () => void;
} = {};

vi.mock('@radix-ui/react-slot', () => ({
  Slot: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}));

vi.mock('react-dropzone', () => ({
  useDropzone: (options: typeof latestDropzoneOptions) => {
    latestDropzoneOptions = options;
    return {
      getRootProps: () => ({}),
      getInputProps: () => ({}),
      isDragActive: false,
    };
  },
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
    latestDropzoneOptions = {};
    useCanvasStore.getState().reset();
  });

  afterEach(() => cleanup());

  it('prompts users for design-system source material', () => {
    render(<DesignSystemNode {...props()} />);
    expect(screen.getByPlaceholderText(/Paste tokens, component guidance, patterns/)).toBeTruthy();
  });

  it('does not expose DESIGN.md generation controls on the Design System node', () => {
    render(<DesignSystemNode {...props({
      title: 'Brand DS',
      content: 'Use red buttons.',
      images: [],
      designMdDocument: {
        content: '---\nname: Brand\n---\n# Brand',
        sourceHash: 'current',
        generatedAt: '2026-01-01T00:00:00Z',
        providerId: 'openrouter',
        modelId: 'test-model',
      },
    })} />);
    expect(screen.queryByText('DESIGN.md')).toBeNull();
    expect(screen.queryByRole('button', { name: /Generate DESIGN\.md/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Refresh/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /View/i })).toBeNull();
  });

  it('stores dropped Markdown files as design-system source material', async () => {
    useCanvasStore.setState({
      nodes: [{ id: 'ds-1', type: 'designSystem', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    });
    render(<DesignSystemNode {...props()} />);
    const file = new File(['# Brand\nUse the calm blue palette.'], 'DESIGN.md', {
      type: 'text/markdown',
    });

    await act(async () => {
      await latestDropzoneOptions.onDrop?.([file]);
    });

    await waitFor(() => {
      const node = useCanvasStore.getState().nodes.find((n) => n.id === 'ds-1');
      expect(node?.data.markdownSources).toEqual([
        expect.objectContaining({
          filename: 'DESIGN.md',
          content: '# Brand\nUse the calm blue palette.',
        }),
      ]);
    });
  });

  it('removes Markdown source rows from the node data', async () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'ds-1',
          type: 'designSystem',
          position: { x: 0, y: 0 },
          data: {
            markdownSources: [
              {
                id: 'md-1',
                filename: 'tokens.md',
                content: '# Tokens',
                sizeBytes: 8,
                createdAt: '2026-01-01T00:00:00Z',
              },
            ],
          },
        },
      ],
      edges: [],
    });
    render(<DesignSystemNode {...props({
      markdownSources: [
        {
          id: 'md-1',
          filename: 'tokens.md',
          content: '# Tokens',
          sizeBytes: 8,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove tokens.md' }));

    const node = useCanvasStore.getState().nodes.find((n) => n.id === 'ds-1');
    expect(node?.data.markdownSources).toEqual([]);
  });

  it('shows a clear rejection message for unsupported dropped files', () => {
    render(<DesignSystemNode {...props()} />);

    act(() => {
      latestDropzoneOptions.onDropRejected?.();
    });

    expect(screen.getByText(/Use image files or Markdown files/)).toBeTruthy();
  });
});
