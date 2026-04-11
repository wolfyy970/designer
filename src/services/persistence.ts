import { type DesignSpec, DesignSpecSchema } from '../types/spec';
import { STORAGE_KEYS } from '../lib/storage-keys';

const CANVASES_KEY = STORAGE_KEYS.CANVASES;

export function saveSpecToLibrary(spec: DesignSpec): void {
  const canvases = getAllCanvases();
  canvases[spec.id] = spec;
  localStorage.setItem(CANVASES_KEY, JSON.stringify(canvases));
}

export function getSavedSpec(specId: string): DesignSpec | null {
  const canvases = getAllCanvases();
  return canvases[specId] ?? Object.values(canvases).find((s) => s.id === specId) ?? null;
}

/**
 * Parse saved canvas library from localStorage. Each entry is validated individually so one corrupt
 * or schema-outdated snapshot does not wipe the whole list (and a subsequent saveSpecToLibrary erase others).
 */
function getAllCanvases(): Record<string, DesignSpec> {
  const raw = localStorage.getItem(CANVASES_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('Invalid canvases in localStorage: expected a JSON object');
      return {};
    }
    const out: Record<string, DesignSpec> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const result = DesignSpecSchema.safeParse(value);
      if (result.success) {
        out[id] = result.data;
      } else {
        console.warn(`Skipping invalid saved canvas "${id}"`, result.error);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function deleteSpecFromLibrary(specId: string): void {
  const canvases = getAllCanvases();
  delete canvases[specId];
  localStorage.setItem(CANVASES_KEY, JSON.stringify(canvases));
}

export function getCanvasList(): Array<{ id: string; title: string; lastModified: string }> {
  const canvases = getAllCanvases();
  return Object.values(canvases)
    .map((s) => ({ id: s.id, title: s.title, lastModified: s.lastModified }))
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

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

export async function importCanvas(file: File): Promise<DesignSpec> {
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

  const result = DesignSpecSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('Invalid canvas file: missing required fields');
  }
  return result.data;
}

