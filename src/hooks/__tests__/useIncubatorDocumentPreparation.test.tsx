/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NODE_TYPES } from '../../constants/canvas';
import { useCanvasStore } from '../../stores/canvas-store';
import { useSpecStore } from '../../stores/spec-store';
import { useWorkspaceDomainStore } from '../../stores/workspace-domain-store';
import { computeDesignMdSourceHash } from '../../lib/design-md';
import { useIncubatorDocumentPreparation } from '../useIncubatorDocumentPreparation';
import {
  createInitialTaskStreamState,
  type TaskStreamState,
} from '../task-stream-state';

const apiMocks = vi.hoisted(() => ({
  extractDesignSystem: vi.fn(),
  generateInternalContext: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  extractDesignSystem: apiMocks.extractDesignSystem,
  generateInternalContext: apiMocks.generateInternalContext,
}));

function renderPreparationHook() {
  return renderHook(() => {
    const setTaskStreamState = vi.fn<
      (next: TaskStreamState | ((prev: TaskStreamState) => TaskStreamState)) => void
    >();
    const setContextGenerating = vi.fn<(next: boolean | ((prev: boolean) => boolean)) => void>();
    const setDesignMdGeneratingNodeId = vi.fn<
      (next: string | null | ((prev: string | null) => string | null)) => void
    >();
    return useIncubatorDocumentPreparation({
      incubatorId: 'inc-1',
      providerId: 'openrouter',
      modelId: 'test-model',
      setTaskStreamState,
      setContextGenerating,
      setDesignMdGeneratingNodeId,
    });
  });
}

describe('useIncubatorDocumentPreparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceDomainStore.getState().reset();
    useCanvasStore.getState().reset();
    useSpecStore.getState().createNewCanvas('Test');
    useSpecStore.getState().updateSection('design-brief', 'Improve onboarding.');
    apiMocks.generateInternalContext.mockResolvedValue({ result: '# Context' });
    apiMocks.extractDesignSystem.mockResolvedValue({
      result: '---\nname: Generated\n---\n# Generated',
      lint: { errors: 0, warnings: 0, infos: 0, findings: [] },
    });
  });

  it('refreshes internal context and stores the returned document', async () => {
    const { result } = renderPreparationHook();

    await act(async () => {
      await result.current.refreshInternalContext();
    });

    expect(apiMocks.generateInternalContext).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceHash: expect.stringMatching(/^fnv1a:/),
        providerId: 'openrouter',
        modelId: 'test-model',
      }),
      expect.anything(),
    );
    expect(useSpecStore.getState().spec.internalContextDocument?.content).toBe('# Context');
  });

  it('preserves existing DESIGN.md content when refresh fails', async () => {
    apiMocks.extractDesignSystem.mockRejectedValueOnce(new Error('extract failed'));
    const source = { title: 'Brand DS', content: 'Use red buttons.', images: [] };
    const existing = {
      content: '# Existing',
      sourceHash: computeDesignMdSourceHash(source),
      generatedAt: '2026-01-01T00:00:00Z',
      providerId: 'openrouter',
      modelId: 'old-model',
    };
    useCanvasStore.setState({
      nodes: [
        { id: 'inc-1', type: NODE_TYPES.INCUBATOR, position: { x: 0, y: 0 }, data: {} },
        {
          id: 'ds-1',
          type: NODE_TYPES.DESIGN_SYSTEM,
          position: { x: 0, y: 0 },
          data: { ...source, designMdDocument: existing },
        },
      ],
      edges: [],
    });
    const { result } = renderPreparationHook();

    await act(async () => {
      await expect(result.current.refreshDesignMdDocument('ds-1')).rejects.toThrow('extract failed');
    });

    const doc = useCanvasStore.getState().nodes.find((n) => n.id === 'ds-1')?.data.designMdDocument;
    expect(doc?.content).toBe('# Existing');
    expect(doc?.generatedAt).toBe('2026-01-01T00:00:00Z');
    expect(doc?.error).toBe('extract failed');
  });

  it('refreshes stale DESIGN.md documents before returning prompt inputs', async () => {
    useCanvasStore.setState({
      nodes: [
        { id: 'inc-1', type: NODE_TYPES.INCUBATOR, position: { x: 0, y: 0 }, data: {} },
        {
          id: 'ds-1',
          type: NODE_TYPES.DESIGN_SYSTEM,
          position: { x: 0, y: 0 },
          data: {
            title: 'Brand DS',
            content: 'Use red buttons.',
            images: [],
            designMdDocument: {
              content: '# Old',
              sourceHash: 'old',
              generatedAt: '2026-01-01T00:00:00Z',
              providerId: 'openrouter',
              modelId: 'old-model',
            },
          },
        },
      ],
      edges: [
        { id: 'e-ds-inc', source: 'ds-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } },
      ],
    });
    const { result } = renderPreparationHook();

    let docs: Awaited<ReturnType<typeof result.current.ensureDesignSystemDocuments>> = [];
    await act(async () => {
      docs = await result.current.ensureDesignSystemDocuments();
    });

    expect(apiMocks.extractDesignSystem).toHaveBeenCalled();
    expect(docs).toEqual([
      { nodeId: 'ds-1', title: 'Brand DS', content: '---\nname: Generated\n---\n# Generated' },
    ]);
  });

  it('passes uploaded Markdown sources into DESIGN.md preparation', async () => {
    const markdownSource = {
      id: 'md1',
      filename: 'DESIGN.md',
      content: '# Uploaded design language',
      sizeBytes: 26,
      createdAt: '2026-01-01T00:00:00Z',
    };
    useCanvasStore.setState({
      nodes: [
        { id: 'inc-1', type: NODE_TYPES.INCUBATOR, position: { x: 0, y: 0 }, data: {} },
        {
          id: 'ds-1',
          type: NODE_TYPES.DESIGN_SYSTEM,
          position: { x: 0, y: 0 },
          data: {
            title: 'Brand DS',
            content: '',
            images: [],
            markdownSources: [markdownSource],
          },
        },
      ],
      edges: [
        { id: 'e-ds-inc', source: 'ds-1', target: 'inc-1', type: 'dataFlow', data: { status: 'idle' } },
      ],
    });
    const { result } = renderPreparationHook();

    await act(async () => {
      await result.current.ensureDesignSystemDocuments();
    });

    expect(apiMocks.extractDesignSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        markdownSources: [markdownSource],
      }),
      expect.anything(),
    );
  });

  it('exports the same initial task state shape expected by callers', () => {
    expect(createInitialTaskStreamState('idle').status).toBe('idle');
  });
});
