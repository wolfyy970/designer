/**
 * Orchestration for the saved spec library vs the active session (spec + compiler + generation + canvas).
 * Keeps persistence and Zustand `getState()` calls out of React components.
 */
import type { DesignSpec } from '../types/spec';
import { useSpecStore } from '../stores/spec-store';
import { useCompilerStore } from '../stores/compiler-store';
import { useGenerationStore } from '../stores/generation-store';
import { useCanvasStore } from '../stores/canvas-store';
import { saveSpecToLibrary, getSavedSpec, importCanvas } from './persistence';
import { generateId, now } from '../lib/utils';

export function checkpointCurrentSpec(): void {
  saveSpecToLibrary(useSpecStore.getState().spec);
}

export function resetSessionStores(): void {
  useCompilerStore.getState().reset();
  useGenerationStore.getState().reset();
  useCanvasStore.getState().resetCanvas();
}

/** Apply a DesignSpec to the active session (normalizes sections in spec-store). */
export function applySpecToActiveSession(spec: DesignSpec): void {
  useSpecStore.getState().loadCanvas(spec);
}

export function activateSavedSpecById(specId: string): boolean {
  checkpointCurrentSpec();
  const spec = getSavedSpec(specId);
  if (!spec) return false;
  resetSessionStores();
  applySpecToActiveSession(spec);
  return true;
}

export function activateSpecFromImport(spec: DesignSpec): void {
  checkpointCurrentSpec();
  resetSessionStores();
  applySpecToActiveSession(spec);
}

export async function activateImportedSpecFile(file: File): Promise<void> {
  checkpointCurrentSpec();
  const spec = await importCanvas(file);
  resetSessionStores();
  applySpecToActiveSession(spec);
}

export function startNewCanvasAfterCheckpoint(title?: string): void {
  checkpointCurrentSpec();
  resetSessionStores();
  useSpecStore.getState().createNewCanvas(title);
}

/** Copy of current spec with new id; resets session so graph aligns with duplicated spec sections. */
export function duplicateCurrentSpec(): void {
  checkpointCurrentSpec();
  const spec = useSpecStore.getState().spec;
  const dup: DesignSpec = {
    ...spec,
    id: generateId(),
    title: `${spec.title} (copy)`,
    createdAt: now(),
    lastModified: now(),
  };
  saveSpecToLibrary(dup);
  resetSessionStores();
  applySpecToActiveSession(dup);
}

let titleLibrarySyncTimer: ReturnType<typeof setTimeout> | null = null;

/** If this spec id is already in the library, persist the latest doc (e.g. after header rename). Debounced. */
export function scheduleLibraryTitleSyncIfEntryExists(debounceMs = 400): void {
  if (titleLibrarySyncTimer) clearTimeout(titleLibrarySyncTimer);
  titleLibrarySyncTimer = setTimeout(() => {
    titleLibrarySyncTimer = null;
    const s = useSpecStore.getState().spec;
    if (getSavedSpec(s.id) != null) {
      saveSpecToLibrary({ ...s, lastModified: now() });
    }
  }, debounceMs);
}
