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
    render(<DesignSystemNode {...props({ sourceMode: 'custom' })} />);
    expect(screen.getByPlaceholderText(/Paste tokens, component guidance, patterns/)).toBeTruthy();
    expect(screen.getByText('Add custom notes, images, or Markdown.')).toBeTruthy();
  });

  it('defaults to the built-in Wireframe source and has no delete affordance', () => {
    render(<DesignSystemNode {...props()} />);
    expect(screen.getAllByText('Wireframe').length).toBeGreaterThan(0);
    expect(screen.getByText(/Using built-in Wireframe DESIGN\.md/)).toBeTruthy();
    expect(screen.queryByTitle('Delete from canvas')).toBeNull();
  });

  it('can switch to custom source mode without discarding custom source data', () => {
    const data = {
      sourceMode: 'wireframe',
      content: 'Use calm blue.',
      markdownSources: [
        {
          id: 'md-1',
          filename: 'tokens.md',
          content: '# Tokens',
          sizeBytes: 8,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    };
    useCanvasStore.setState({
      nodes: [{ id: 'ds-1', type: 'designSystem', position: { x: 0, y: 0 }, data }],
      edges: [],
    });
    render(<DesignSystemNode {...props(data)} />);

    expect(screen.getByText('Using Wireframe. Custom sources are saved.')).toBeTruthy();
    expect(screen.getByText('Style')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Design system style'), {
      target: { value: 'custom' },
    });

    expect(useCanvasStore.getState().nodes.find((n) => n.id === 'ds-1')?.data.sourceMode).toBe('custom');
  });

  it('switches to custom source mode when the user edits source text', () => {
    useCanvasStore.setState({
      nodes: [{ id: 'ds-1', type: 'designSystem', position: { x: 0, y: 0 }, data: {} }],
      edges: [],
    });
    render(<DesignSystemNode {...props()} />);

    fireEvent.change(screen.getByPlaceholderText(/Paste tokens, component guidance, patterns/), {
      target: { value: 'Use soft neutral surfaces.' },
    });

    const node = useCanvasStore.getState().nodes.find((n) => n.id === 'ds-1');
    expect(node?.data.sourceMode).toBe('custom');
    expect(node?.data.content).toBe('Use soft neutral surfaces.');
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
    render(<DesignSystemNode {...props({ sourceMode: 'custom' })} />);
    const file = new File(['# Brand\nUse the calm blue palette.'], 'DESIGN.md', {
      type: 'text/markdown',
    });

    await act(async () => {
      await latestDropzoneOptions.onDrop?.([file]);
    });

    await waitFor(() => {
      const node = useCanvasStore.getState().nodes.find((n) => n.id === 'ds-1');
      expect(node?.data.sourceMode).toBe('custom');
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
            sourceMode: 'custom',
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
      sourceMode: 'custom',
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
    render(<DesignSystemNode {...props({ sourceMode: 'custom' })} />);

    act(() => {
      latestDropzoneOptions.onDropRejected?.();
    });

    expect(screen.getByText(/Use image files or Markdown files/)).toBeTruthy();
  });
});
