import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DesignSpec } from '../../types/spec';

const mocks = vi.hoisted(() => ({
  mockSaveSpecToLibrary: vi.fn(),
  mockGetSavedSpec: vi.fn(),
  mockImportCanvas: vi.fn(),
  mockLoadCanvas: vi.fn(),
  mockCreateNewCanvas: vi.fn(),
  mockCompilerReset: vi.fn(),
  mockGenerationReset: vi.fn(),
  mockResetCanvas: vi.fn(),
}));

const activeSpec: DesignSpec = {
  id: 'active-1',
  title: 'Active',
  createdAt: '2024-01-01',
  lastModified: '2024-01-01',
  version: 1,
  sections: {
    'design-brief': {
      id: 'design-brief',
      content: '',
      images: [],
      lastModified: '2024-01-01',
    },
    'existing-design': {
      id: 'existing-design',
      content: '',
      images: [],
      lastModified: '2024-01-01',
    },
    'research-context': {
      id: 'research-context',
      content: '',
      images: [],
      lastModified: '2024-01-01',
    },
    'objectives-metrics': {
      id: 'objectives-metrics',
      content: '',
      images: [],
      lastModified: '2024-01-01',
    },
    'design-constraints': {
      id: 'design-constraints',
      content: '',
      images: [],
      lastModified: '2024-01-01',
    },
    'design-system': {
      id: 'design-system',
      content: '',
      images: [],
      lastModified: '2024-01-01',
    },
  },
};

vi.mock('../persistence.ts', () => ({
  saveSpecToLibrary: mocks.mockSaveSpecToLibrary,
  getSavedSpec: mocks.mockGetSavedSpec,
  importCanvas: mocks.mockImportCanvas,
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

vi.mock('../../stores/compiler-store.ts', () => ({
  useCompilerStore: {
    getState: () => ({ reset: mocks.mockCompilerReset }),
  },
}));

vi.mock('../../stores/generation-store.ts', () => ({
  useGenerationStore: {
    getState: () => ({ reset: mocks.mockGenerationReset }),
  },
}));

vi.mock('../../stores/canvas-store.ts', () => ({
  useCanvasStore: {
    getState: () => ({ resetCanvas: mocks.mockResetCanvas }),
  },
}));

import { activateSavedSpecById, startNewCanvasAfterCheckpoint } from '../canvas-library-session';

describe('canvas-library-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('activateSavedSpecById checkpoints then loads when found', () => {
    const saved = { ...activeSpec, id: 'other' };
    mocks.mockGetSavedSpec.mockReturnValue(saved);
    expect(activateSavedSpecById('other')).toBe(true);
    expect(mocks.mockSaveSpecToLibrary).toHaveBeenCalledWith(activeSpec);
    expect(mocks.mockCompilerReset).toHaveBeenCalledOnce();
    expect(mocks.mockGenerationReset).toHaveBeenCalledOnce();
    expect(mocks.mockResetCanvas).toHaveBeenCalledOnce();
    expect(mocks.mockLoadCanvas).toHaveBeenCalledWith(saved);
  });

  it('activateSavedSpecById returns false and skips reset when missing', () => {
    mocks.mockGetSavedSpec.mockReturnValue(null);
    expect(activateSavedSpecById('missing')).toBe(false);
    expect(mocks.mockSaveSpecToLibrary).toHaveBeenCalledWith(activeSpec);
    expect(mocks.mockLoadCanvas).not.toHaveBeenCalled();
    expect(mocks.mockCompilerReset).not.toHaveBeenCalled();
  });

  it('startNewCanvasAfterCheckpoint resets stores and creates new canvas', () => {
    startNewCanvasAfterCheckpoint('Fresh');
    expect(mocks.mockSaveSpecToLibrary).toHaveBeenCalledWith(activeSpec);
    expect(mocks.mockCompilerReset).toHaveBeenCalledOnce();
    expect(mocks.mockCreateNewCanvas).toHaveBeenCalledWith('Fresh');
  });
});
