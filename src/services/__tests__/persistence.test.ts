import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STORAGE_KEYS } from '../../lib/storage-keys';
import {
  getSavedSpec,
  getCanvasList,
  getSavedCanvasIds,
  getSavedCanvasSnapshot,
  saveSnapshotToLibrary,
  deleteCanvasFromLibrary,
  importCanvasSnapshotOrSpec,
} from '../persistence';
import type { DesignSpec, SpecSection, SpecSectionId } from '../../types/spec';
import type { SavedCanvasSnapshot } from '../../types/saved-canvas';

// IndexedDB tier is mocked: tests assert the localStorage index mutations and that the snapshot
// store is called with the right keys (jsdom has no real IndexedDB).
const idb = vi.hoisted(() => ({
  saveCanvasSnapshot: vi.fn(),
  loadCanvasSnapshot: vi.fn(),
  deleteCanvasSnapshot: vi.fn(),
}));

vi.mock('../idb-storage', () => ({
  saveCanvasSnapshot: idb.saveCanvasSnapshot,
  loadCanvasSnapshot: idb.loadCanvasSnapshot,
  deleteCanvasSnapshot: idb.deleteCanvasSnapshot,
}));

// Mock localStorage
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, val: string) => storage.set(key, val),
    removeItem: (key: string) => storage.delete(key),
  });
  idb.saveCanvasSnapshot.mockReset().mockResolvedValue(undefined);
  idb.loadCanvasSnapshot.mockReset().mockResolvedValue(undefined);
  idb.deleteCanvasSnapshot.mockReset().mockResolvedValue(undefined);
});

function makeSection(id: SpecSectionId): SpecSection {
  return { id, content: '', images: [], lastModified: '2024-01-01' };
}

function makeSpec(overrides: Partial<DesignSpec> & { id: string }): DesignSpec {
  return {
    title: 'Test Spec',
    createdAt: '2024-01-01',
    lastModified: '2024-01-01',
    version: 1,
    sections: {
      'design-brief': makeSection('design-brief'),
      'research-context': makeSection('research-context'),
      'objectives-metrics': makeSection('objectives-metrics'),
      'design-constraints': makeSection('design-constraints'),
      'design-system': makeSection('design-system'),
    },
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<SavedCanvasSnapshot> = {}): SavedCanvasSnapshot {
  const spec = makeSpec({ id: 'canvas-1', title: 'Full Canvas' });
  return {
    schemaVersion: 1,
    savedAt: '2026-01-01T00:00:00.000Z',
    spec,
    canvas: {
      nodes: [
        {
          id: 'design-brief-node',
          type: 'designBrief',
          position: { x: 0, y: 0 },
          data: { refId: 'design-brief' },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      showMiniMap: true,
      colGap: 420,
    },
    workspaceDomain: {
      incubatorWirings: {},
      hypotheses: {},
      designSystems: {},
      previewSlots: {},
    },
    incubator: {
      incubationPlans: {},
      compiledPrompts: [],
      selectedProvider: 'openrouter',
      selectedModel: 'model-1',
    },
    generation: {
      results: [],
      selectedVersions: {},
      userBestOverrides: {},
    },
    artifacts: {},
    ...overrides,
  };
}

// ── getAllCanvases validation ────────────────────────────────────────────

describe('getSavedSpec / getAllCanvases validation', () => {
  it('returns null for missing spec', () => {
    expect(getSavedSpec('nonexistent')).toBeNull();
  });

  it('handles corrupt localStorage (not JSON)', () => {
    storage.set(STORAGE_KEYS.CANVASES, '{{invalid json}}');
    expect(getSavedSpec('any')).toBeNull();
  });

  it('handles localStorage containing an array instead of object', () => {
    storage.set(STORAGE_KEYS.CANVASES, '[1,2,3]');
    expect(getSavedSpec('any')).toBeNull();
  });

  it('handles localStorage containing a string instead of object', () => {
    storage.set(STORAGE_KEYS.CANVASES, '"just a string"');
    expect(getSavedSpec('any')).toBeNull();
  });

  it('handles localStorage containing null', () => {
    storage.set(STORAGE_KEYS.CANVASES, 'null');
    expect(getSavedSpec('any')).toBeNull();
  });

  it('keeps valid canvases when another entry fails validation', () => {
    const good = makeSpec({ id: 'good', title: 'Keep me' });
    storage.set(
      STORAGE_KEYS.CANVASES,
      JSON.stringify({
        good,
        bad: { id: 'bad', title: 'Broken' },
      }),
    );
    expect(getSavedSpec('good')?.title).toBe('Keep me');
    expect(getSavedSpec('bad')).toBeNull();
    expect(getCanvasList()).toHaveLength(1);
  });
});

// ── getSavedSpec (legacy spec-only read path) ─────────────────────────────

describe('getSavedSpec', () => {
  it('resolves a legacy spec-only entry', () => {
    const spec = makeSpec({ id: 'spec-1', title: 'My Spec' });
    storage.set(STORAGE_KEYS.CANVASES, JSON.stringify({ 'spec-1': spec }));
    expect(getSavedSpec('spec-1')?.title).toBe('My Spec');
  });

  it('resolves spec when localStorage key differs from spec.id (legacy blobs)', () => {
    const spec = makeSpec({ id: 'real-id', title: 'Legacy' });
    storage.set(STORAGE_KEYS.CANVASES, JSON.stringify({ 'wrong-key': spec }));
    expect(getSavedSpec('real-id')).toEqual(spec);
    expect(getSavedSpec('wrong-key')).toEqual(spec);
  });
});

// ── saveSnapshotToLibrary / getSavedCanvasSnapshot / deleteCanvasFromLibrary ──

describe('saved canvas snapshots', () => {
  it('saveSnapshotToLibrary writes the index entry and the snapshot blob', async () => {
    const snapshot = makeSnapshot();
    await saveSnapshotToLibrary(snapshot);

    expect(getCanvasList()).toEqual([
      { id: 'canvas-1', title: 'Full Canvas', lastModified: '2024-01-01' },
    ]);
    expect(idb.saveCanvasSnapshot).toHaveBeenCalledWith('canvas-1', snapshot);
  });

  it('getSavedCanvasSnapshot returns the blob when its spec.id matches the entry', async () => {
    const snapshot = makeSnapshot();
    await saveSnapshotToLibrary(snapshot);
    idb.loadCanvasSnapshot.mockResolvedValue(snapshot);

    expect(await getSavedCanvasSnapshot('canvas-1')).toBe(snapshot);
  });

  it('getSavedCanvasSnapshot returns null when the blob spec.id drifts from the key (identity guard)', async () => {
    await saveSnapshotToLibrary(makeSnapshot());
    // Store returns a blob belonging to a different canvas — must not load the wrong one.
    idb.loadCanvasSnapshot.mockResolvedValue(makeSnapshot({ spec: makeSpec({ id: 'other', title: 'Other' }) }));

    expect(await getSavedCanvasSnapshot('canvas-1')).toBeNull();
  });

  it('getSavedCanvasSnapshot returns null for an unknown id', async () => {
    expect(await getSavedCanvasSnapshot('missing')).toBeNull();
    expect(idb.loadCanvasSnapshot).not.toHaveBeenCalled();
  });

  it('deleteCanvasFromLibrary removes the index entry and the snapshot blob', async () => {
    await saveSnapshotToLibrary(makeSnapshot());
    expect(getCanvasList()).toHaveLength(1);

    await deleteCanvasFromLibrary('canvas-1');

    expect(getCanvasList()).toHaveLength(0);
    expect(idb.deleteCanvasSnapshot).toHaveBeenCalledWith('canvas-1');
  });

  it('deleteCanvasFromLibrary is a no-op for an unknown id but still clears any orphan blob', async () => {
    await deleteCanvasFromLibrary('missing');
    expect(getCanvasList()).toHaveLength(0);
    expect(idb.deleteCanvasSnapshot).toHaveBeenCalledWith('missing');
  });
});

// ── getSavedCanvasIds (snapshot GC source of truth) ───────────────────────

describe('getSavedCanvasIds', () => {
  it('returns the set of canvas ids in the index', async () => {
    await saveSnapshotToLibrary(makeSnapshot({ spec: makeSpec({ id: 'a', title: 'A' }) }));
    await saveSnapshotToLibrary(makeSnapshot({ spec: makeSpec({ id: 'b', title: 'B' }) }));
    expect(getSavedCanvasIds()).toEqual(new Set(['a', 'b']));
  });

  it('returns an empty set when nothing is saved', () => {
    expect(getSavedCanvasIds()).toEqual(new Set());
  });
});

// ── getCanvasList ──────────────────────────────────────────────────────

describe('getCanvasList', () => {
  it('returns entries sorted by lastModified descending', async () => {
    await saveSnapshotToLibrary(
      makeSnapshot({ spec: makeSpec({ id: 's1', title: 'Old', lastModified: '2024-01-01' }) }),
    );
    await saveSnapshotToLibrary(
      makeSnapshot({ spec: makeSpec({ id: 's2', title: 'New', lastModified: '2024-06-01' }) }),
    );
    const list = getCanvasList();
    expect(list[0].title).toBe('New');
    expect(list[1].title).toBe('Old');
  });

  it('returns empty array when nothing saved', () => {
    expect(getCanvasList()).toEqual([]);
  });
});

// ── importCanvasSnapshotOrSpec validation ─────────────────────────────────

describe('importCanvasSnapshotOrSpec', () => {
  function makeFile(content: string): File {
    return new File([content], 'test.json', { type: 'application/json' });
  }

  it('accepts a valid spec file', async () => {
    const spec = makeSpec({ id: 'imp-1' });
    const file = makeFile(JSON.stringify(spec));
    const result = await importCanvasSnapshotOrSpec(file);
    expect('schemaVersion' in result).toBe(false);
    expect((result as DesignSpec).id).toBe('imp-1');
  });

  it('rejects file without id', async () => {
    const file = makeFile(JSON.stringify({ title: 'No ID', sections: {} }));
    await expect(importCanvasSnapshotOrSpec(file)).rejects.toThrow('missing required fields');
  });

  it('rejects file without title', async () => {
    const file = makeFile(JSON.stringify({ id: 'x', sections: {} }));
    await expect(importCanvasSnapshotOrSpec(file)).rejects.toThrow('missing required fields');
  });

  it('rejects file with non-object sections', async () => {
    const file = makeFile(JSON.stringify({ id: 'x', title: 'T', sections: 'string' }));
    await expect(importCanvasSnapshotOrSpec(file)).rejects.toThrow('missing required fields');
  });

  it('rejects file with null sections', async () => {
    const file = makeFile(JSON.stringify({ id: 'x', title: 'T', sections: null }));
    await expect(importCanvasSnapshotOrSpec(file)).rejects.toThrow('missing required fields');
  });

  it('rejects unparseable JSON', async () => {
    const file = makeFile('not json');
    await expect(importCanvasSnapshotOrSpec(file)).rejects.toThrow('could not parse JSON');
  });

  it('accepts a full saved canvas bundle', async () => {
    const snapshot = makeSnapshot();
    const file = makeFile(JSON.stringify({ kind: 'designer.canvas', snapshot }));

    const result = await importCanvasSnapshotOrSpec(file);

    expect('schemaVersion' in result).toBe(true);
    if ('schemaVersion' in result) {
      expect(result.spec.id).toBe('canvas-1');
      expect(result.canvas.nodes[0].type).toBe('designBrief');
    }
  });

  it('rejects malformed full saved canvas bundles before restore', async () => {
    const snapshot = makeSnapshot({
      canvas: {
        viewport: { x: 0, y: 0, zoom: 1 },
        edges: [],
        showMiniMap: true,
        colGap: 420,
      } as unknown as SavedCanvasSnapshot['canvas'],
    });
    const file = makeFile(JSON.stringify({ kind: 'designer.canvas', snapshot }));

    await expect(importCanvasSnapshotOrSpec(file)).rejects.toThrow('missing required fields');
  });
});
