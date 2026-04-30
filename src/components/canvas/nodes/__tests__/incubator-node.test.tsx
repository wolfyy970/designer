/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';
import IncubatorNode from '../IncubatorNode';
import { useSpecStore } from '../../../../stores/spec-store';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { useIncubatorStore } from '../../../../stores/incubator-store';
import { useWorkspaceDomainStore } from '../../../../stores/workspace-domain-store';
import { computeDesignMdSourceHash } from '../../../../lib/design-md';
import { computeInternalContextSourceHash } from '../../../../lib/internal-context';

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
    useSpecStore.getState().setInternalContextDocument(undefined);
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

  it('shows missing design specification status by default without document actions', () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    render(<IncubatorNode {...minimalIncubatorProps()} />);
    expect(screen.getByText('Design specification')).toBeTruthy();
    expect(screen.getByText('missing')).toBeTruthy();
    expect(screen.getByText('DESIGN.md')).toBeTruthy();
    expect(screen.getByText('optional')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View design specification' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh design specification' })).toBeNull();
  });

  it('shows ready design specification as green-dot-only with view action', () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    const currentSpec = useSpecStore.getState().spec;
    useSpecStore.getState().setInternalContextDocument({
      content: '# Context',
      sourceHash: computeInternalContextSourceHash(currentSpec),
      generatedAt: '2026-01-01T00:00:00Z',
      providerId: 'openrouter',
      modelId: 'test-model',
    });
    const { container } = render(<IncubatorNode {...minimalIncubatorProps()} />);

    expect(screen.getByText('Design specification')).toBeTruthy();
    expect(container.querySelector('.bg-success')).toBeTruthy();
    expect(screen.queryByText('ready')).toBeNull();
    expect(screen.getByRole('button', { name: 'View design specification' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh design specification' })).toBeNull();
  });

  it('shows stale design specification status with view and refresh actions', () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    useSpecStore.getState().setInternalContextDocument({
      content: '# Context',
      sourceHash: 'old',
      generatedAt: '2026-01-01T00:00:00Z',
      providerId: 'openrouter',
      modelId: 'test-model',
    });
    render(<IncubatorNode {...minimalIncubatorProps()} />);
    expect(screen.getByText('stale')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View design specification' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Refresh design specification' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('places generated document rows above connected input controls', () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    render(<IncubatorNode {...minimalIncubatorProps()} />);

    const contextRow = screen.getByText('Design specification');
    const inputCount = screen.getByText(/inputs? connected/);
    expect(Boolean(contextRow.compareDocumentPosition(inputCount) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('shows connected DESIGN.md as needing generation before a document exists', () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    useCanvasStore.setState({
      nodes: [
        { id: 'inc-1', type: 'incubator', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'ds-1',
          type: 'designSystem',
          position: { x: 0, y: 0 },
          data: { title: 'Brand DS', content: 'Use red buttons.', images: [] },
        },
      ],
      edges: [{ id: 'e-ds-inc', source: 'ds-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } }],
    });
    render(<IncubatorNode {...minimalIncubatorProps()} />);

    expect(screen.getByText('DESIGN.md')).toBeTruthy();
    expect(screen.getByText('needs generation')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Refresh DESIGN.md' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'View DESIGN.md' })).toBeNull();
  });

  it('shows error design specification status when the last refresh failed', () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    useSpecStore.getState().setInternalContextDocument({
      content: '',
      sourceHash: 'old',
      generatedAt: '2026-01-01T00:00:00Z',
      providerId: 'openrouter',
      modelId: 'test-model',
      error: 'Context failed',
    });
    render(<IncubatorNode {...minimalIncubatorProps()} />);
    expect(screen.getByText('error')).toBeTruthy();
    expect(screen.getByText('Context failed')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Refresh design specification' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows ready scoped DESIGN.md as green-dot-only with view action', () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    const source = { title: 'Brand DS', content: 'Use red buttons.', images: [] };
    useCanvasStore.setState({
      nodes: [
        { id: 'inc-1', type: 'incubator', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'ds-1',
          type: 'designSystem',
          position: { x: 0, y: 0 },
          data: {
            ...source,
            designMdDocument: {
              content: '---\nname: Brand\n---\n# Brand',
              sourceHash: computeDesignMdSourceHash(source),
              generatedAt: '2026-01-01T00:00:00Z',
              providerId: 'openrouter',
              modelId: 'test-model',
            },
          },
        },
      ],
      edges: [{ id: 'e-ds-inc', source: 'ds-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } }],
    });
    const { container } = render(<IncubatorNode {...minimalIncubatorProps()} />);
    expect(screen.getByText('DESIGN.md')).toBeTruthy();
    expect(container.querySelector('.bg-success')).toBeTruthy();
    expect(screen.queryByText('ready')).toBeNull();
    expect(screen.getByRole('button', { name: 'View DESIGN.md' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh DESIGN.md' })).toBeNull();
  });

  it('shows stale and error states for scoped design-system DESIGN.md documents', () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    useCanvasStore.setState({
      nodes: [
        { id: 'inc-1', type: 'incubator', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'stale-ds',
          type: 'designSystem',
          position: { x: 0, y: 0 },
          data: {
            title: 'Stale DS',
            content: 'Use red buttons.',
            images: [],
            designMdDocument: {
              content: '---\nname: Old\n---\n# Old',
              sourceHash: 'old',
              generatedAt: '2026-01-01T00:00:00Z',
              providerId: 'openrouter',
              modelId: 'test-model',
            },
          },
        },
        {
          id: 'error-ds',
          type: 'designSystem',
          position: { x: 0, y: 0 },
          data: {
            title: 'Error DS',
            content: 'Use blue buttons.',
            images: [],
            designMdDocument: {
              content: '',
              sourceHash: 'old',
              generatedAt: '2026-01-01T00:00:00Z',
              providerId: 'openrouter',
              modelId: 'test-model',
              error: 'DESIGN.md failed',
            },
          },
        },
      ],
      edges: [
        { id: 'e-stale-inc', source: 'stale-ds', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } },
        { id: 'e-error-inc', source: 'error-ds', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } },
      ],
    });
    render(<IncubatorNode {...minimalIncubatorProps()} />);

    expect(screen.getByText('stale')).toBeTruthy();
    expect(screen.getByText('error')).toBeTruthy();
    expect(screen.getByText('DESIGN.md failed')).toBeTruthy();
    const refreshButtons = screen.getAllByRole('button', { name: 'Refresh DESIGN.md' }) as HTMLButtonElement[];
    expect(refreshButtons).toHaveLength(2);
    expect(refreshButtons.every((button) => button.disabled === false)).toBe(true);
  });

  it('shows generating state while refreshing a scoped DESIGN.md document', async () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    let resolveExtract: (value: unknown) => void = () => {};
    apiMocks.extractDesignSystem.mockReturnValueOnce(new Promise((resolve) => {
      resolveExtract = resolve;
    }));
    useCanvasStore.setState({
      nodes: [
        { id: 'inc-1', type: 'incubator', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'ds-1',
          type: 'designSystem',
          position: { x: 0, y: 0 },
          data: { title: 'Brand DS', content: 'Use red buttons.', images: [] },
        },
      ],
      edges: [{ id: 'e-ds-inc', source: 'ds-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } }],
    });
    render(<IncubatorNode {...minimalIncubatorProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh DESIGN.md' }));
    expect(await screen.findByText('generating...')).toBeTruthy();
    resolveExtract({
      result: '---\nname: Generated\n---\n# Generated',
      lint: { errors: 0, warnings: 0, infos: 0, findings: [] },
    });
    await waitFor(() => expect(screen.queryByText('generating...')).toBeNull());
  });

  it('refreshes missing DESIGN.md before incubating', async () => {
    useSpecStore.getState().updateSection('design-brief', 'Ship a calmer onboarding.');
    const currentSpec = useSpecStore.getState().spec;
    useSpecStore.getState().setInternalContextDocument({
      content: '# Context',
      sourceHash: computeInternalContextSourceHash(currentSpec),
      generatedAt: '2026-01-01T00:00:00Z',
      providerId: 'openrouter',
      modelId: 'test-model',
    });
    useCanvasStore.setState({
      nodes: [
        { id: 'inc-1', type: 'incubator', position: { x: 0, y: 0 }, data: {} },
        {
          id: 'ds-1',
          type: 'designSystem',
          position: { x: 0, y: 0 },
          data: { title: 'Brand DS', content: 'Use red buttons.', images: [] },
        },
      ],
      edges: [{ id: 'e-ds-inc', source: 'ds-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } }],
    });
    render(<IncubatorNode {...minimalIncubatorProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /Generate hypotheses/ }));
    await waitFor(() => expect(apiMocks.extractDesignSystem).toHaveBeenCalled());
    await waitFor(() => expect(apiMocks.incubateStream).toHaveBeenCalled());
    expect(apiMocks.extractDesignSystem.mock.invocationCallOrder[0]).toBeLessThan(
      apiMocks.incubateStream.mock.invocationCallOrder[0],
    );
  });
});
