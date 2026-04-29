import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DesignSpec } from '../../types/spec';
import type { SavedCanvasSnapshot } from '../../types/saved-canvas';

const mocks = vi.hoisted(() => ({
  mockCaptureCurrentCanvasSnapshot: vi.fn(),
  mockRestoreCanvasSnapshot: vi.fn(),
  mockSaveSnapshotToLibrary: vi.fn(),
  mockGetSavedCanvasSnapshot: vi.fn(),
  mockGetSavedSpec: vi.fn(),
  mockImportCanvasSnapshotOrSpec: vi.fn(),
  mockLoadCanvas: vi.fn(),
  mockCreateNewCanvas: vi.fn(),
  mockIncubatorReset: vi.fn(),
  mockIncubatorSetState: vi.fn(),
  mockGenerationSetState: vi.fn(),
  mockResetCanvas: vi.fn(),
  mockDomainReset: vi.fn(),
  mockMaterializeOptionalInputNodesFromSpec: vi.fn(),
  mockAbortAllGenerations: vi.fn(),
  mockAbortCanvasOperationsForReplacement: vi.fn(),
}));

const activeSpec: DesignSpec = {
  id: 'active-1',
  title: 'Active',
  createdAt: '2024-01-01',
  lastModified: '2024-01-01',
  version: 1,
  sections: {
    'design-brief': { id: 'design-brief', content: '', images: [], lastModified: '2024-01-01' },
    'existing-design': { id: 'existing-design', content: '', images: [], lastModified: '2024-01-01' },
    'research-context': { id: 'research-context', content: '', images: [], lastModified: '2024-01-01' },
    'objectives-metrics': { id: 'objectives-metrics', content: '', images: [], lastModified: '2024-01-01' },
    'design-constraints': { id: 'design-constraints', content: '', images: [], lastModified: '2024-01-01' },
    'design-system': { id: 'design-system', content: '', images: [], lastModified: '2024-01-01' },
  },
};

const activeSnapshot = {
  schemaVersion: 1,
  savedAt: '2024-01-01',
  spec: activeSpec,
  canvas: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, showMiniMap: true, colGap: 320 },
  workspaceDomain: {
    incubatorWirings: {},
    incubatorModelNodeIds: {},
    hypotheses: {},
    modelProfiles: {},
    designSystems: {},
    previewSlots: {},
  },
  incubator: {
    incubationPlans: {},
    compiledPrompts: [],
    selectedProvider: 'openrouter',
    selectedModel: 'model',
  },
  generation: {
    results: [],
    selectedVersions: {},
    userBestOverrides: {},
  },
  artifacts: {},
} satisfies SavedCanvasSnapshot;

vi.mock('../canvas-snapshots.ts', () => ({
  captureCurrentCanvasSnapshot: mocks.mockCaptureCurrentCanvasSnapshot,
  restoreCanvasSnapshot: mocks.mockRestoreCanvasSnapshot,
}));

vi.mock('../persistence.ts', () => ({
  saveSnapshotToLibrary: mocks.mockSaveSnapshotToLibrary,
  getSavedCanvasSnapshot: mocks.mockGetSavedCanvasSnapshot,
  getSavedSpec: mocks.mockGetSavedSpec,
  importCanvasSnapshotOrSpec: mocks.mockImportCanvasSnapshotOrSpec,
}));

vi.mock('../../lib/generation-abort-registry.ts', () => ({
  abortAllGenerations: mocks.mockAbortAllGenerations,
}));

vi.mock('../../lib/canvas-session-guard.ts', () => ({
  abortCanvasOperationsForReplacement: mocks.mockAbortCanvasOperationsForReplacement,
}));

vi.mock('../../stores/spec-store.ts', () => ({
  useSpecStore: {
    getState: () => ({
      spec: activeSpec,
      loadCanvas: mocks.mockLoadCanvas,
      createNewCanvas: mocks.mockCreateNewCanvas,
    }),
  },
}));

vi.mock('../../stores/incubator-store.ts', () => ({
  useIncubatorStore: {
    getState: () => ({ reset: mocks.mockIncubatorReset }),
    setState: mocks.mockIncubatorSetState,
  },
}));

vi.mock('../../stores/generation-store.ts', () => ({
  useGenerationStore: {
    getState: () => ({ results: [] }),
    setState: mocks.mockGenerationSetState,
  },
}));

vi.mock('../../stores/canvas-store.ts', () => ({
  useCanvasStore: {
    getState: () => ({
      resetCanvas: mocks.mockResetCanvas,
      materializeOptionalInputNodesFromSpec: mocks.mockMaterializeOptionalInputNodesFromSpec,
    }),
  },
}));

vi.mock('../../stores/workspace-domain-store.ts', () => ({
  useWorkspaceDomainStore: {
    getState: () => ({ reset: mocks.mockDomainReset }),
  },
}));

import {
  activateSavedSpecById,
  saveCurrentCanvasSnapshot,
  startNewCanvasAfterCheckpoint,
} from '../canvas-library-session';

describe('canvas-library-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockCaptureCurrentCanvasSnapshot.mockResolvedValue(activeSnapshot);
    mocks.mockSaveSnapshotToLibrary.mockResolvedValue(undefined);
    mocks.mockRestoreCanvasSnapshot.mockResolvedValue(undefined);
    mocks.mockGetSavedCanvasSnapshot.mockResolvedValue(null);
    mocks.mockGetSavedSpec.mockReturnValue(null);
  });

  it('saveCurrentCanvasSnapshot writes a full snapshot without stopping active work by default', async () => {
    await saveCurrentCanvasSnapshot();

    expect(mocks.mockAbortAllGenerations).not.toHaveBeenCalled();
    expect(mocks.mockAbortCanvasOperationsForReplacement).not.toHaveBeenCalled();
    expect(mocks.mockSaveSnapshotToLibrary).toHaveBeenCalledWith(activeSnapshot);
  });

  it('activateSavedSpecById checkpoints full current snapshot then restores saved snapshot', async () => {
    const saved = { ...activeSnapshot, spec: { ...activeSpec, id: 'other' } };
    mocks.mockGetSavedCanvasSnapshot.mockResolvedValue(saved);

    await expect(activateSavedSpecById('other')).resolves.toEqual({ ok: true });

    expect(mocks.mockAbortAllGenerations).toHaveBeenCalledOnce();
    expect(mocks.mockAbortCanvasOperationsForReplacement).toHaveBeenCalledOnce();
    expect(mocks.mockSaveSnapshotToLibrary).toHaveBeenCalledWith(activeSnapshot);
    expect(mocks.mockDomainReset).toHaveBeenCalledOnce();
    expect(mocks.mockIncubatorReset).toHaveBeenCalledOnce();
    expect(mocks.mockGenerationSetState).toHaveBeenCalled();
    expect(mocks.mockResetCanvas).toHaveBeenCalledOnce();
    expect(mocks.mockRestoreCanvasSnapshot).toHaveBeenCalledWith(saved);
  });

  it('activateSavedSpecById with skipCheckpoint stops work but does not overwrite saved copy', async () => {
    const saved = { ...activeSnapshot, spec: { ...activeSpec, id: 'active-1' } };
    mocks.mockGetSavedCanvasSnapshot.mockResolvedValue(saved);

    await expect(activateSavedSpecById('active-1', { skipCheckpoint: true })).resolves.toEqual({ ok: true });

    expect(mocks.mockAbortAllGenerations).toHaveBeenCalledOnce();
    expect(mocks.mockSaveSnapshotToLibrary).not.toHaveBeenCalled();
    expect(mocks.mockRestoreCanvasSnapshot).toHaveBeenCalledWith(saved);
  });

  it('activateSavedSpecById falls back to legacy spec-only entries', async () => {
    const legacy = { ...activeSpec, id: 'legacy' };
    mocks.mockGetSavedSpec.mockReturnValue(legacy);

    await expect(activateSavedSpecById('legacy')).resolves.toEqual({ ok: true });

    expect(mocks.mockSaveSnapshotToLibrary).toHaveBeenCalledWith(activeSnapshot);
    expect(mocks.mockLoadCanvas).toHaveBeenCalledWith(legacy);
    expect(mocks.mockMaterializeOptionalInputNodesFromSpec).toHaveBeenCalledWith(legacy);
  });

  it('startNewCanvasAfterCheckpoint checkpoints then resets and creates a fresh canvas', async () => {
    await startNewCanvasAfterCheckpoint('Fresh');

    expect(mocks.mockSaveSnapshotToLibrary).toHaveBeenCalledWith(activeSnapshot);
    expect(mocks.mockDomainReset).toHaveBeenCalledOnce();
    expect(mocks.mockIncubatorReset).toHaveBeenCalledOnce();
    expect(mocks.mockGenerationSetState).toHaveBeenCalled();
    expect(mocks.mockResetCanvas).toHaveBeenCalledOnce();
    expect(mocks.mockCreateNewCanvas).toHaveBeenCalledWith('Fresh');
  });
});
