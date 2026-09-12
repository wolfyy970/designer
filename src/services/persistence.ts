import { isRecord } from '../lib/is-record';
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
  if (!isSavedCanvasListEntry(entry)) return null;
  const snapshot = await loadCanvasSnapshot(entry.id);
  if (!snapshot) return null;
  // Identity guard: the blob at this key must be the canvas we asked for. A mismatch means
  // the snapshot store drifted from the index (corruption / interrupted write) — treat as
  // missing so callers fall back to the not-found path rather than loading the wrong canvas.
  if (snapshot.spec.id !== entry.id) {
    console.warn(
      `Saved canvas "${entry.id}" resolved a snapshot for "${snapshot.spec.id}"; treating as corrupt`,
    );
    return null;
  }
  return snapshot;
}

export async function deleteCanvasFromLibrary(specId: string): Promise<void> {
  const index = getAllCanvasIndex();
  delete index[specId];
  setAllCanvasIndex(index);
  await deleteCanvasSnapshot(specId);
}

export function getCanvasList(): Array<{ id: string; title: string; lastModified: string }> {
  const index = getAllCanvasIndex();
  return Object.values(index)
    .map((s) => ({ id: s.id, title: s.title, lastModified: s.lastModified }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

/** The set of canvas ids the library knows about — the source of truth for snapshot GC. */
export function getSavedCanvasIds(): Set<string> {
  return new Set(Object.values(getAllCanvasIndex()).map((s) => s.id));
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
