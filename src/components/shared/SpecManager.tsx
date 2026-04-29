import { useCallback, useRef, useState } from 'react';
import { Download, Upload, Copy, Trash2, Check, RefreshCw } from 'lucide-react';
import { normalizeError } from '../../lib/error-utils';
import { useSpecStore } from '../../stores/spec-store';
import { FEEDBACK_DISMISS_MS } from '../../lib/constants';
import {
  deleteCanvasFromLibrary,
} from '../../services/persistence';
import {
  activateSavedSpecById,
  activateImportedSpecFile,
  startNewCanvasAfterCheckpoint,
  duplicateCurrentSpec,
  exportCurrentCanvas,
  saveCurrentCanvasSnapshot,
  type ActivateSavedSpecResult,
} from '../../services/canvas-library-session';
import { useCanvasLibraryList } from '../../hooks/useCanvasLibraryList';
import {
  CANVAS_MANAGER_LOAD_FAILED,
  CANVAS_MANAGER_RELOAD_CONFIRM,
  CANVAS_MANAGER_STORAGE_WARNING,
} from './canvas-manager-copy';
import Modal from './Modal';

interface SpecManagerProps {
  open: boolean;
  onClose: () => void;
}

export default function SpecManager({ open, onClose }: SpecManagerProps) {
  const spec = useSpecStore((s) => s.spec);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { specs, refresh } = useCanvasLibraryList(open);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [busy, setBusy] = useState(false);

  const runManagerAction = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
        refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleSave = useCallback(() => {
    void runManagerAction(async () => {
      await saveCurrentCanvasSnapshot();
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), FEEDBACK_DISMISS_MS);
    });
  }, [runManagerAction]);

  const finalizeLoadResult = useCallback(
    (result: ActivateSavedSpecResult) => {
      if (result.ok) {
        refresh();
        onClose();
      } else {
        alert(CANVAS_MANAGER_LOAD_FAILED);
      }
    },
    [refresh, onClose],
  );

  const handleLoad = useCallback(
    (specId: string) => {
      void runManagerAction(async () => {
        finalizeLoadResult(await activateSavedSpecById(specId));
      });
    },
    [finalizeLoadResult, runManagerAction],
  );

  const handleReloadFromSaved = useCallback(
    (specId: string) => {
      if (!window.confirm(CANVAS_MANAGER_RELOAD_CONFIRM)) return;
      void runManagerAction(async () => {
        finalizeLoadResult(await activateSavedSpecById(specId, { skipCheckpoint: true }));
      });
    },
    [finalizeLoadResult, runManagerAction],
  );

  const handleDelete = useCallback(
    (specId: string, entryTitle: string) => {
      if (
        !window.confirm(
          `Remove “${entryTitle}” from saved canvases? This does not affect your open document unless it is the one you delete.`,
        )
      ) {
        return;
      }
      void runManagerAction(async () => {
        await deleteCanvasFromLibrary(specId);
      });
    },
    [runManagerAction],
  );

  const handleExport = useCallback(() => {
    void runManagerAction(exportCurrentCanvas);
  }, [runManagerAction]);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await runManagerAction(async () => {
          await activateImportedSpecFile(file);
          onClose();
        });
      } catch (err) {
        alert(normalizeError(err, 'Import failed'));
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [runManagerAction, onClose],
  );

  const handleDuplicate = useCallback(() => {
    void runManagerAction(async () => {
      await duplicateCurrentSpec();
      onClose();
    });
  }, [runManagerAction, onClose]);

  const handleNew = useCallback(() => {
    void runManagerAction(async () => {
      await startNewCanvasAfterCheckpoint();
      onClose();
    });
  }, [runManagerAction, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Canvas Manager">
      <div className="space-y-4">
        <div className="ds-callout-note" role="note">
          {CANVAS_MANAGER_STORAGE_WARNING}
        </div>

        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-nano font-medium uppercase tracking-wide text-fg-muted">
            Currently editing
          </p>
          <p className="text-sm font-medium text-fg-secondary">{spec.title}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="ds-btn-primary-muted"
          >
            {savedFeedback ? (
              <>
                <Check size={12} />
                Saved!
              </>
            ) : (
              'Save Current'
            )}
          </button>
          <button
            type="button"
            onClick={handleNew}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface"
            title="Saves your current work, then starts a blank spec and resets the graph"
          >
            New Canvas
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={busy}
            className="flex items-center justify-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface"
            title="Saves current work, then opens a copy with new id (graph reset to match the copy)"
          >
            <Copy size={12} />
            Duplicate
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={busy}
            className="flex items-center justify-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface"
            title="Download the full canvas workspace as JSON"
          >
            <Download size={12} />
            Export Canvas
          </button>
          <label
            className="flex cursor-pointer items-center justify-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface sm:col-span-2"
            title="Replace session with a previously exported JSON file (graph resets)"
          >
            <Upload size={12} />
            Import Canvas
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
        </div>

        {specs.length > 0 ? (
          <div>
            <h3 className="mb-2 text-xs font-medium text-fg-secondary">Saved Canvases</h3>
            <div className="space-y-1">
              {specs.map((s) => {
                const isActive = s.id === spec.id;
                return (
                  <div
                    key={s.id}
                    className={`ds-list-row${isActive ? ' ds-list-row-current' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <span
                        className={`text-sm font-medium ${isActive ? 'text-fg' : 'text-fg-secondary'}`}
                      >
                        {s.title}
                      </span>
                      {isActive && (
                        <span className="ds-chip-current">Active</span>
                      )}
                      <span className="ml-2 text-xs text-fg-muted">
                        {new Date(s.lastModified).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {isActive ? (
                        <button
                          type="button"
                          onClick={() => handleReloadFromSaved(s.id)}
                          disabled={busy}
                          className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-nano font-medium text-fg-secondary hover:bg-surface-raised"
                          title="Discard unsaved changes and reload the saved copy from this list"
                        >
                          <RefreshCw size={12} />
                          Reload saved
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleLoad(s.id)}
                          disabled={busy}
                          className="rounded-md border border-border bg-surface px-2 py-1 text-nano font-medium text-fg-secondary hover:bg-surface-raised"
                        >
                          Load
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id, s.title)}
                        disabled={isActive || busy}
                        className={`rounded p-1 ${
                          isActive
                            ? 'cursor-not-allowed text-fg-faint'
                            : 'text-fg-muted hover:bg-error-subtle hover:text-error'
                        }`}
                        aria-label="Delete canvas"
                        title={
                          isActive
                            ? 'Cannot delete the active canvas'
                            : 'Delete canvas'
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-fg-muted">
            No saved canvases yet. Click &ldquo;Save Current&rdquo; to save your work.
          </p>
        )}
      </div>
    </Modal>
  );
}
