import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERATION_STATUS } from '../../constants/generation';

const mocks = vi.hoisted(() => ({
  mockLoadCode: vi.fn(),
  mockLoadFiles: vi.fn(),
  mockLoadProvenance: vi.fn(),
  mockLoadRoundFiles: vi.fn(),
  mockSaveCode: vi.fn(),
  mockSaveFiles: vi.fn(),
  mockSaveProvenance: vi.fn(),
  mockSaveRoundFiles: vi.fn(),
  mockSpecState: vi.fn(),
  mockCanvasState: vi.fn(),
  mockDomainState: vi.fn(),
  mockIncubatorState: vi.fn(),
  mockGenerationState: vi.fn(),
}));

vi.mock('../idb-storage.ts', () => ({
  loadCode: mocks.mockLoadCode,
  loadFiles: mocks.mockLoadFiles,
  loadProvenance: mocks.mockLoadProvenance,
  loadRoundFiles: mocks.mockLoadRoundFiles,
  saveCode: mocks.mockSaveCode,
  saveFiles: mocks.mockSaveFiles,
  saveProvenance: mocks.mockSaveProvenance,
  saveRoundFiles: mocks.mockSaveRoundFiles,
}));

vi.mock('../../stores/spec-store.ts', () => ({
  useSpecStore: { getState: mocks.mockSpecState },
}));

vi.mock('../../stores/canvas-store.ts', () => ({
  useCanvasStore: { getState: mocks.mockCanvasState, setState: vi.fn() },
}));

vi.mock('../../stores/workspace-domain-store.ts', () => ({
  useWorkspaceDomainStore: { getState: mocks.mockDomainState, setState: vi.fn() },
}));

vi.mock('../../stores/incubator-store.ts', () => ({
  useIncubatorStore: { getState: mocks.mockIncubatorState, setState: vi.fn() },
}));

vi.mock('../../stores/generation-store.ts', () => ({
  useGenerationStore: { getState: mocks.mockGenerationState, setState: vi.fn() },
}));

import { captureCurrentCanvasSnapshot, restoreSnapshotArtifacts } from '../canvas-snapshots';

describe('canvas-snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockSpecState.mockReturnValue({
      spec: {
        id: 'canvas-1',
        title: 'Canvas',
        createdAt: '2024-01-01',
        lastModified: '2024-01-02',
        version: 1,
        sections: {},
      },
    });
    mocks.mockCanvasState.mockReturnValue({
      nodes: [
        { id: 'brief', type: 'designBrief', position: { x: 0, y: 0 }, data: {} },
        { id: 'ghost', type: 'inputGhost', position: { x: 0, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e1', source: 'brief', target: 'inc', type: 'data', data: { status: 'idle' } }],
      viewport: { x: 1, y: 2, zoom: 0.75 },
      showMiniMap: false,
      colGap: 420,
    });
    mocks.mockDomainState.mockReturnValue({
      incubatorWirings: { inc: { inputNodeIds: ['brief'], previewNodeIds: [], designSystemNodeIds: [] } },
      incubatorModelNodeIds: { inc: ['model'] },
      hypotheses: { hyp: { id: 'hyp', incubatorId: 'inc', strategyId: 's1', modelNodeIds: [], designSystemNodeIds: [], placeholder: false } },
      modelProfiles: { model: { nodeId: 'model', providerId: 'openrouter', modelId: 'm' } },
      designSystems: {},
      previewSlots: { slot: { hypothesisId: 'hyp', strategyId: 's1', previewNodeId: 'preview', activeResultId: 'r1', pinnedRunId: null } },
    });
    mocks.mockIncubatorState.mockReturnValue({
      incubationPlans: { inc: { id: 'p1', specId: 'canvas-1', dimensions: [], hypotheses: [], generatedAt: '2024-01-01', incubatorModel: 'm' } },
      compiledPrompts: [{ id: 'cp1', strategyId: 's1', specId: 'canvas-1', prompt: 'prompt', images: [], compiledAt: '2024-01-01' }],
      selectedProvider: 'openrouter',
      selectedModel: 'm',
    });
    mocks.mockGenerationState.mockReturnValue({
      results: [{
        id: 'r1',
        strategyId: 's1',
        providerId: 'openrouter',
        status: GENERATION_STATUS.COMPLETE,
        code: '<html />',
        liveFiles: { 'index.html': '<html />' },
        runId: 'run',
        runNumber: 1,
        metadata: { model: 'm' },
        evaluationRounds: [{ round: 1, aggregate: { overallScore: 4, normalizedScores: {}, hardFails: [], prioritizedFixes: [], shouldRevise: false, revisionBrief: '' } }],
      }],
      selectedVersions: { s1: 'r1' },
      userBestOverrides: { s1: 'r1' },
    });
    mocks.mockLoadCode.mockResolvedValue('<html />');
    mocks.mockLoadFiles.mockResolvedValue({ 'index.html': '<html />' });
    mocks.mockLoadProvenance.mockResolvedValue({ provider: 'openrouter', model: 'm', timestamp: 'now', compiledPrompt: 'p', hypothesisSnapshot: { name: 'h', hypothesis: 'h', rationale: '', dimensionValues: {} } });
    mocks.mockLoadRoundFiles.mockResolvedValue({ 'index.html': '<html />' });
  });

  it('captures full canvas state and generated artifacts', async () => {
    const snapshot = await captureCurrentCanvasSnapshot();

    expect(snapshot.spec.id).toBe('canvas-1');
    expect(snapshot.canvas.nodes.map((node) => node.id)).toEqual(['brief']);
    expect(snapshot.canvas.viewport.zoom).toBe(0.75);
    expect(snapshot.workspaceDomain.hypotheses.hyp.strategyId).toBe('s1');
    expect(snapshot.incubator.incubationPlans.inc.id).toBe('p1');
    expect(snapshot.generation.results[0].code).toBeUndefined();
    expect(snapshot.generation.selectedVersions.s1).toBe('r1');
    expect(snapshot.artifacts.r1.files).toEqual({ 'index.html': '<html />' });
    expect(snapshot.artifacts.r1.roundFiles?.[1]).toEqual({ 'index.html': '<html />' });
  });

  it('restores saved artifacts into active result ids', async () => {
    await restoreSnapshotArtifacts({
      schemaVersion: 1,
      savedAt: '2024-01-01',
      spec: mocks.mockSpecState().spec,
      canvas: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, showMiniMap: true, colGap: 320 },
      workspaceDomain: { incubatorWirings: {}, incubatorModelNodeIds: {}, hypotheses: {}, modelProfiles: {}, designSystems: {}, previewSlots: {} },
      incubator: { incubationPlans: {}, compiledPrompts: [], selectedProvider: 'openrouter', selectedModel: 'm' },
      generation: { results: [], selectedVersions: {}, userBestOverrides: {} },
      artifacts: { r1: { code: '<html />', files: { 'index.html': '<html />' }, roundFiles: { 1: { 'index.html': '<html />' } } } },
    });

    expect(mocks.mockSaveCode).toHaveBeenCalledWith('r1', '<html />');
    expect(mocks.mockSaveFiles).toHaveBeenCalledWith('r1', { 'index.html': '<html />' });
    expect(mocks.mockSaveRoundFiles).toHaveBeenCalledWith('r1', 1, { 'index.html': '<html />' });
  });
});
