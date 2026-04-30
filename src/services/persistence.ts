import { type DesignSpec, DesignSpecSchema } from '../types/spec';
import { STORAGE_KEYS } from '../lib/storage-keys';
import {
  type SavedCanvasExportBundle,
  type SavedCanvasListEntry,
  type SavedCanvasSnapshot,
  SavedCanvasExportBundleSchema,
} from '../types/saved-canvas';
import {
  deleteCanvasSnapshot,
  loadCanvasSnapshot,
  saveCanvasSnapshot,
} from './idb-storage';

const CANVASES_KEY = STORAGE_KEYS.CANVASES;

type CanvasIndexEntry = SavedCanvasListEntry | DesignSpec;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSavedCanvasListEntry(value: unknown): value is SavedCanvasListEntry {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.lastModified === 'string' &&
    typeof value.savedAt === 'string' &&
    value.schemaVersion === 1
  );
}

function getAllCanvasIndex(): Record<string, CanvasIndexEntry> {
  const raw = localStorage.getItem(CANVASES_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      console.warn('Invalid canvases in localStorage: expected a JSON object');
      return {};
    }
    const out: Record<string, CanvasIndexEntry> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (isSavedCanvasListEntry(value)) {
        out[id] = value;
        continue;
      }
      const legacy = DesignSpecSchema.safeParse(value);
      if (legacy.success) {
        out[id] = legacy.data;
      } else {
        console.warn(`Skipping invalid saved canvas "${id}"`, legacy.error);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function setAllCanvasIndex(index: Record<string, CanvasIndexEntry>): void {
  localStorage.setItem(CANVASES_KEY, JSON.stringify(index));
}

function snapshotToEntry(snapshot: SavedCanvasSnapshot): SavedCanvasListEntry {
  return {
    id: snapshot.spec.id,
    title: snapshot.spec.title,
    lastModified: snapshot.spec.lastModified,
    savedAt: snapshot.savedAt,
    schemaVersion: snapshot.schemaVersion,
  };
}

export async function saveSnapshotToLibrary(snapshot: SavedCanvasSnapshot): Promise<void> {
  const index = getAllCanvasIndex();
  index[snapshot.spec.id] = snapshotToEntry(snapshot);
  setAllCanvasIndex(index);
  await saveCanvasSnapshot(snapshot.spec.id, snapshot);
}

/** Legacy helper retained for imports/tests that still save spec-only entries. */
export function saveSpecToLibrary(spec: DesignSpec): void {
  const index = getAllCanvasIndex();
  index[spec.id] = spec;
  setAllCanvasIndex(index);
}

export function getSavedSpec(specId: string): DesignSpec | null {
  const index = getAllCanvasIndex();
  const entry = index[specId] ?? Object.values(index).find((s) => s.id === specId);
  if (!entry) return null;
  if (isSavedCanvasListEntry(entry)) return null;
  return entry;
}

export async function getSavedCanvasSnapshot(specId: string): Promise<SavedCanvasSnapshot | null> {
  const index = getAllCanvasIndex();
  const entry = index[specId] ?? Object.values(index).find((s) => s.id === specId);
  if (!entry) return null;
  if (isSavedCanvasListEntry(entry)) {
    return (await loadCanvasSnapshot(entry.id)) ?? null;
  }
  return null;
}

export async function deleteCanvasFromLibrary(specId: string): Promise<void> {
  const index = getAllCanvasIndex();
  delete index[specId];
  setAllCanvasIndex(index);
  await deleteCanvasSnapshot(specId);
}

/** Legacy name retained for call sites while Canvas Manager migrates to full snapshots. */
export function deleteSpecFromLibrary(specId: string): void {
  const index = getAllCanvasIndex();
  delete index[specId];
  setAllCanvasIndex(index);
  if (typeof indexedDB !== 'undefined') {
    void deleteCanvasSnapshot(specId);
  }
}

export function getCanvasList(): Array<{ id: string; title: string; lastModified: string }> {
  const index = getAllCanvasIndex();
  return Object.values(index)
    .map((s) => ({ id: s.id, title: s.title, lastModified: s.lastModified }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

export function exportSnapshot(snapshot: SavedCanvasSnapshot): void {
  const bundle: SavedCanvasExportBundle = { kind: 'designer.canvas', snapshot };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${snapshot.spec.title.replace(/\s+/g, '-').toLowerCase()}-canvas.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Legacy name retained; exports spec-only JSON for old callers. */
export function exportCanvas(spec: DesignSpec): void {
  const blob = new Blob([JSON.stringify(spec, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${spec.title.replace(/\s+/g, '-').toLowerCase()}-canvas.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importCanvasSnapshotOrSpec(file: File): Promise<SavedCanvasSnapshot | DesignSpec> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error('Invalid canvas file: could not parse JSON');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid canvas file: could not parse JSON');
  }

  if (isRecord(parsed) && parsed.kind === 'designer.canvas') {
    const result = SavedCanvasExportBundleSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error('Invalid canvas file: missing required fields');
    }
    return result.data.snapshot;
  }

  const result = DesignSpecSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('Invalid canvas file: missing required fields');
  }
  return result.data;
}

export async function importCanvas(file: File): Promise<DesignSpec> {
  const imported = await importCanvasSnapshotOrSpec(file);
  if ('schemaVersion' in imported) return imported.spec;
  return imported;
}
