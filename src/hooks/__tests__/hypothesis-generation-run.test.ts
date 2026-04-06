import { describe, expect, it, vi } from 'vitest';
import { GENERATION_STATUS } from '../../constants/generation';
import {
  applyGenerationFailureToLanes,
  executeHypothesisGenerationRun,
} from '../hypothesis-generation-run';
import type { GenerationResult } from '../../types/provider';
import type { HypothesisGenerationContext } from '../../workspace/hypothesis-generation-pure';
import type { HypothesisGenerateApiPayload } from '../../api/types';
import type { HypothesisStrategy } from '../../types/incubator';

const hypothesisStrategy = { id: 'vs-1' } as HypothesisStrategy;

const minimalGenCtx = {
  hypothesisNodeId: 'hyp-1',
  hypothesisStrategy,
  spec: { id: 's1' } as HypothesisGenerationContext['spec'],
  agentMode: 'single' as const,
  modelCredentials: [
    { providerId: 'p', modelId: 'm', thinkingLevel: 'minimal' as const },
  ],
  designSystemContent: undefined,
  designSystemImages: [],
} satisfies HypothesisGenerationContext;

describe('applyGenerationFailureToLanes', () => {
  it('updates only GENERATING results for listed ids', () => {
    const results: GenerationResult[] = [
      {
        id: 'a',
        strategyId: 'vs-1',
        providerId: 'p',
        status: GENERATION_STATUS.GENERATING,
        runId: 'r',
        runNumber: 1,
        metadata: { model: 'm' },
      },
      {
        id: 'b',
        strategyId: 'vs-1',
        providerId: 'p',
        status: GENERATION_STATUS.COMPLETE,
        runId: 'r',
        runNumber: 1,
        metadata: { model: 'm' },
      },
    ];
    const patches: Array<{ id: string; patch: Partial<GenerationResult> }> = [];
    applyGenerationFailureToLanes(
      ['a', 'b'],
      'boom',
      () => results,
      (id, patch) => patches.push({ id, patch }),
    );
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({
      id: 'a',
      patch: { status: GENERATION_STATUS.ERROR, error: 'boom' },
    });
  });

  it('no-ops when ids list is empty', () => {
    const patches: unknown[] = [];
    applyGenerationFailureToLanes(
      [],
      'x',
      () => [],
      () => patches.push(1),
    );
    expect(patches).toHaveLength(0);
  });
});

describe('executeHypothesisGenerationRun', () => {
  it('returns no_prompt when bundle has no prompts', async () => {
    const setCompiledPrompts = vi.fn();
    const result = await executeHypothesisGenerationRun(
      {
        workspacePayload: {} as HypothesisGenerateApiPayload,
        genCtx: minimalGenCtx,
        nodeId: 'hyp-1',
        runId: 'run-1',
        signal: new AbortController().signal,
        setCompiledPrompts,
        addResult: vi.fn(),
        updateResult: vi.fn(),
        nextRunNumberForStrategy: () => 1,
        syncAfterGenerate: vi.fn(),
        getCanvasState: () => ({
          previewNodeIdMap: new Map<string, string>(),
          setRunInspectorPreview: vi.fn(),
        }),
        scheduleFitView: vi.fn(),
        fetchBundle: vi.fn().mockResolvedValue({
          prompts: [],
          evaluationContext: null,
          provenance: { strategies: {}, designSystemSnapshot: null },
          generationContext: { agentMode: 'single', modelCredentials: [] },
        }),
        runStream: vi.fn(),
        onLaneIdsReady: vi.fn(),
      },
      vi.fn(),
    );
    expect(result).toEqual({ ok: false, reason: 'no_prompt' });
    expect(setCompiledPrompts).toHaveBeenCalledWith([]);
    expect(result.ok === false || result.ok).toBe(true);
  });

  it('reports modelCredentialCount from bundle generationContext (lane source of truth)', async () => {
    const prompt = {
      id: 'cp1',
      strategyId: 'vs-1',
      specId: 's1',
      prompt: 'p',
      images: [],
      compiledAt: 't',
    };
    const result = await executeHypothesisGenerationRun(
      {
        workspacePayload: {} as HypothesisGenerateApiPayload,
        genCtx: {
          ...minimalGenCtx,
          modelCredentials: [{ providerId: 'p', modelId: 'm', thinkingLevel: 'minimal' }],
        },
        nodeId: 'hyp-1',
        runId: 'run-1',
        signal: new AbortController().signal,
        setCompiledPrompts: vi.fn(),
        addResult: vi.fn(),
        updateResult: vi.fn(),
        nextRunNumberForStrategy: () => 1,
        syncAfterGenerate: vi.fn(),
        getCanvasState: () => ({
          previewNodeIdMap: new Map<string, string>(),
          setRunInspectorPreview: vi.fn(),
        }),
        scheduleFitView: vi.fn(),
        fetchBundle: vi.fn().mockResolvedValue({
          prompts: [prompt],
          evaluationContext: null,
          provenance: { strategies: {}, designSystemSnapshot: undefined },
          generationContext: {
            agentMode: 'single',
            modelCredentials: [
              { providerId: 'a', modelId: '1', thinkingLevel: 'minimal' },
              { providerId: 'b', modelId: '2', thinkingLevel: 'minimal' },
            ],
          },
        }),
        runStream: vi.fn().mockResolvedValue(undefined),
        onLaneIdsReady: vi.fn(),
      },
      vi.fn(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.modelCredentialCount).toBe(2);
      expect(result.lanePlaceholderIds).toHaveLength(2);
    }
  });
});
