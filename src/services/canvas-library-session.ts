/**
 * Orchestration for the saved canvas library vs the active session.
 * Saved canvases are full workspace snapshots; legacy spec-only entries still restore.
 */
import type { DesignSpec } from '../types/spec';
import { useSpecStore } from '../stores/spec-store';
import { useIncubatorStore } from '../stores/incubator-store';
import { useGenerationStore } from '../stores/generation-store';
import { useCanvasStore } from '../stores/canvas-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { GENERATION_STATUS } from '../constants/generation';
import {
  exportSnapshot,
  getSavedCanvasSnapshot,
  getSavedSpec,
  importCanvasSnapshotOrSpec,
  saveSnapshotToLibrary,
} from './persistence';
import { captureCurrentCanvasSnapshot, restoreCanvasSnapshot } from './canvas-snapshots';
import { abortAllGenerations } from '../lib/generation-abort-registry';
import { abortCanvasOperationsForReplacement } from '../lib/canvas-session-guard';
import { generateId, now } from '../lib/utils';

function stopActiveWork(): void {
  abortCanvasOperationsForReplacement();
  abortAllGenerations();
  useGenerationStore.setState((state) => ({
    isGenerating: false,
    results: state.results.map((result) =>
      result.status === GENERATION_STATUS.GENERATING
        ? { ...result, status: GENERATION_STATUS.ERROR, error: 'Generation stopped.' }
        : result,
    ),
  }));
  useIncubatorStore.setState({ isCompiling: false });
}

export async function saveCurrentCanvasSnapshot(options?: { stopActiveWork?: boolean }): Promise<void> {
  if (options?.stopActiveWork) stopActiveWork();
  await saveSnapshotToLibrary(await captureCurrentCanvasSnapshot());
}

function resetSessionStores(): void {
  useWorkspaceDomainStore.getState().reset();
  useIncubatorStore.getState().reset();
  useGenerationStore.setState({
    results: [],
    isGenerating: false,
    selectedVersions: {},
    userBestOverrides: {},
  });
  useCanvasStore.getState().resetCanvas();
}

export type ActivateSavedSpecResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' };

/** Apply a legacy DesignSpec to the active session (normalizes sections in spec-store). */
function applySpecToActiveSession(spec: DesignSpec): void {
  useSpecStore.getState().loadCanvas(spec);
  useCanvasStore.getState().materializeOptionalInputNodesFromSpec(spec);
}

/**
 * @param options.skipCheckpoint - Use when reloading the active library entry from disk without
 *   persisting the current dirty state first; otherwise checkpoint would overwrite the saved copy.
 */
export async function activateSavedSpecById(
  specId: string,
  options?: { skipCheckpoint?: boolean },
): Promise<ActivateSavedSpecResult> {
  if (!options?.skipCheckpoint) {
    await saveCurrentCanvasSnapshot({ stopActiveWork: true });
  } else {
    stopActiveWork();
  }

  const snapshot = await getSavedCanvasSnapshot(specId);
  if (snapshot) {
    resetSessionStores();
    await restoreCanvasSnapshot(snapshot);
    return { ok: true };
  }

  const legacySpec = getSavedSpec(specId);
  if (!legacySpec) return { ok: false, reason: 'not_found' };
  resetSessionStores();
  applySpecToActiveSession(legacySpec);
  return { ok: true };
}

export async function activateImportedSpecFile(file: File): Promise<void> {
  await saveCurrentCanvasSnapshot({ stopActiveWork: true });
  const imported = await importCanvasSnapshotOrSpec(file);
  resetSessionStores();
  if ('schemaVersion' in imported) {
    await restoreCanvasSnapshot(imported);
  } else {
    applySpecToActiveSession(imported);
  }
}

export async function startNewCanvasAfterCheckpoint(title?: string): Promise<void> {
  await saveCurrentCanvasSnapshot({ stopActiveWork: true });
  resetSessionStores();
  useSpecStore.getState().createNewCanvas(title);
}

/** Copy of current canvas with new id; preserves the full current workspace under the new id. */
export async function duplicateCurrentSpec(): Promise<void> {
  await saveCurrentCanvasSnapshot({ stopActiveWork: true });
  const snapshot = await captureCurrentCanvasSnapshot();
  const duplicated = {
    ...snapshot,
    savedAt: now(),
    spec: {
      ...snapshot.spec,
      id: generateId(),
      title: `${snapshot.spec.title} (copy)`,
      createdAt: now(),
      lastModified: now(),
    },
  };
  await saveSnapshotToLibrary(duplicated);
  resetSessionStores();
  await restoreCanvasSnapshot(duplicated);
}

export async function exportCurrentCanvas(): Promise<void> {
  exportSnapshot(await captureCurrentCanvasSnapshot());
}

export async function resetCanvasAfterCheckpoint(): Promise<void> {
  await saveCurrentCanvasSnapshot({ stopActiveWork: true });
  resetSessionStores();
}

let titleLibrarySyncTimer: ReturnType<typeof setTimeout> | null = null;

/** If this spec id is already in the library, persist the latest full snapshot after header rename. */
export function scheduleLibraryTitleSyncIfEntryExists(debounceMs = 400): void {
  if (titleLibrarySyncTimer) clearTimeout(titleLibrarySyncTimer);
  titleLibrarySyncTimer = setTimeout(() => {
    titleLibrarySyncTimer = null;
    const spec = useSpecStore.getState().spec;
    if (getSavedSpec(spec.id) != null) {
      void saveCurrentCanvasSnapshot();
      return;
    }
    void getSavedCanvasSnapshot(spec.id).then((snapshot) => {
      if (snapshot) void saveCurrentCanvasSnapshot();
    });
  }, debounceMs);
}
