import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STORAGE_KEYS } from '../../lib/storage-keys';
import { saveCanvas, loadCanvas, deleteCanvas, getCanvasList, importCanvas } from '../persistence';
import type { DesignSpec, SpecSection, SpecSectionId } from '../../types/spec';

// Mock localStorage
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, val: string) => storage.set(key, val),
    removeItem: (key: string) => storage.delete(key),
  });
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
      'existing-design': makeSection('existing-design'),
      'research-context': makeSection('research-context'),
      'objectives-metrics': makeSection('objectives-metrics'),
      'design-constraints': makeSection('design-constraints'),
      'design-system': makeSection('design-system'),
    },
    ...overrides,
  };
}

// ── getAllCanvases validation ────────────────────────────────────────────

describe('loadCanvas / getAllCanvases validation', () => {
  it('returns null for missing spec', () => {
    expect(loadCanvas('nonexistent')).toBeNull();
  });

  it('handles corrupt localStorage (not JSON)', () => {
    storage.set(STORAGE_KEYS.CANVASES, '{{invalid json}}');
    expect(loadCanvas('any')).toBeNull();
  });

  it('handles localStorage containing an array instead of object', () => {
    storage.set(STORAGE_KEYS.CANVASES, '[1,2,3]');
    expect(loadCanvas('any')).toBeNull();
  });

  it('handles localStorage containing a string instead of object', () => {
    storage.set(STORAGE_KEYS.CANVASES, '"just a string"');
    expect(loadCanvas('any')).toBeNull();
  });

  it('handles localStorage containing null', () => {
    storage.set(STORAGE_KEYS.CANVASES, 'null');
    expect(loadCanvas('any')).toBeNull();
  });
});

// ── saveCanvas / loadCanvas / deleteCanvas ──────────────────────────────────

describe('saveCanvas and loadCanvas', () => {
  it('round-trips a spec through save and load', () => {
    const spec = makeSpec({ id: 'spec-1', title: 'My Spec' });
    saveCanvas(spec);
    const loaded = loadCanvas('spec-1');
    expect(loaded?.title).toBe('My Spec');
  });

  it('deleteCanvas removes a spec', () => {
    const spec = makeSpec({ id: 'spec-del' });
    saveCanvas(spec);
    expect(loadCanvas('spec-del')).not.toBeNull();
    deleteCanvas('spec-del');
    expect(loadCanvas('spec-del')).toBeNull();
  });
});

// ── getCanvasList ──────────────────────────────────────────────────────

describe('getCanvasList', () => {
  it('returns specs sorted by lastModified descending', () => {
    saveCanvas(makeSpec({ id: 's1', title: 'Old', lastModified: '2024-01-01' }));
    saveCanvas(makeSpec({ id: 's2', title: 'New', lastModified: '2024-06-01' }));
    const list = getCanvasList();
    expect(list[0].title).toBe('New');
    expect(list[1].title).toBe('Old');
  });

  it('returns empty array when no specs saved', () => {
    expect(getCanvasList()).toEqual([]);
  });
});

// ── importCanvas validation ────────────────────────────────────────────

describe('importCanvas', () => {
  function makeFile(content: string): File {
    return new File([content], 'test.json', { type: 'application/json' });
  }

  it('accepts a valid spec file', async () => {
    const spec = makeSpec({ id: 'imp-1' });
    const file = makeFile(JSON.stringify(spec));
    const result = await importCanvas(file);
    expect(result.id).toBe('imp-1');
  });

  it('rejects file without id', async () => {
    const file = makeFile(JSON.stringify({ title: 'No ID', sections: {} }));
    await expect(importCanvas(file)).rejects.toThrow('missing required fields');
  });

  it('rejects file without title', async () => {
    const file = makeFile(JSON.stringify({ id: 'x', sections: {} }));
    await expect(importCanvas(file)).rejects.toThrow('missing required fields');
  });

  it('rejects file with non-object sections', async () => {
    const file = makeFile(JSON.stringify({ id: 'x', title: 'T', sections: 'string' }));
    await expect(importCanvas(file)).rejects.toThrow('missing required fields');
  });

  it('rejects file with null sections', async () => {
    const file = makeFile(JSON.stringify({ id: 'x', title: 'T', sections: null }));
    await expect(importCanvas(file)).rejects.toThrow('missing required fields');
  });

  it('rejects unparseable JSON', async () => {
    const file = makeFile('not json');
    await expect(importCanvas(file)).rejects.toThrow('could not parse JSON');
  });
});
