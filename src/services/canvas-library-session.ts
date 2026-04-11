/**
 * Orchestration for the saved spec library vs the active session (spec + incubator + generation + canvas).
 * Keeps persistence and Zustand `getState()` calls out of React components.
 */
import type { DesignSpec } from '../types/spec';
import { useSpecStore } from '../stores/spec-store';
import { useIncubatorStore } from '../stores/incubator-store';
import { useGenerationStore } from '../stores/generation-store';
import { useCanvasStore } from '../stores/canvas-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { saveSpecToLibrary, getSavedSpec, importCanvas } from './persistence';
import { generateId, now } from '../lib/utils';

function checkpointCurrentSpec(): void {
  saveSpecToLibrary(useSpecStore.getState().spec);
}

function resetSessionStores(): void {
  useWorkspaceDomainStore.getState().reset();
  useIncubatorStore.getState().reset();
  useGenerationStore.getState().reset();
  useCanvasStore.getState().resetCanvas();
}

export type ActivateSavedSpecResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' };

/** Apply a DesignSpec to the active session (normalizes sections in spec-store). */
function applySpecToActiveSession(spec: DesignSpec): void {
  useSpecStore.getState().loadCanvas(spec);
  useCanvasStore.getState().materializeOptionalInputNodesFromSpec(spec);
}

/**
 * @param options.skipCheckpoint - Use when reloading the active library entry from disk without
 *   persisting the current (possibly dirty) spec first—otherwise checkpoint would overwrite the saved copy.
 */
export function activateSavedSpecById(
  specId: string,
  options?: { skipCheckpoint?: boolean },
): ActivateSavedSpecResult {
  if (!options?.skipCheckpoint) {
    checkpointCurrentSpec();
  }
  const spec = getSavedSpec(specId);
  if (!spec) return { ok: false, reason: 'not_found' };
  resetSessionStores();
  applySpecToActiveSession(spec);
  return { ok: true };
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
