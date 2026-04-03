import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STORAGE_KEYS } from '../../lib/storage-keys';
import {
  saveSpecToLibrary,
  getSavedSpec,
  deleteSpecFromLibrary,
  getCanvasList,
  importCanvas,
} from '../persistence';
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

// ── saveSpecToLibrary / getSavedSpec / deleteSpecFromLibrary ──────────────────

describe('saveSpecToLibrary and getSavedSpec', () => {
  it('round-trips a spec through save and load', () => {
    const spec = makeSpec({ id: 'spec-1', title: 'My Spec' });
    saveSpecToLibrary(spec);
    const loaded = getSavedSpec('spec-1');
    expect(loaded?.title).toBe('My Spec');
  });

  it('deleteSpecFromLibrary removes a spec', () => {
    const spec = makeSpec({ id: 'spec-del' });
    saveSpecToLibrary(spec);
    expect(getSavedSpec('spec-del')).not.toBeNull();
    deleteSpecFromLibrary('spec-del');
    expect(getSavedSpec('spec-del')).toBeNull();
  });
});

// ── getCanvasList ──────────────────────────────────────────────────────

describe('getCanvasList', () => {
  it('returns specs sorted by lastModified descending', () => {
    saveSpecToLibrary(makeSpec({ id: 's1', title: 'Old', lastModified: '2024-01-01' }));
    saveSpecToLibrary(makeSpec({ id: 's2', title: 'New', lastModified: '2024-06-01' }));
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
