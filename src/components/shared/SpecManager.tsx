import { useCallback, useRef, useState } from 'react';
import { Download, Upload, Copy, Trash2, Check } from 'lucide-react';
import { normalizeError } from '../../lib/error-utils';
import { useSpecStore } from '../../stores/spec-store';
import { FEEDBACK_DISMISS_MS } from '../../lib/constants';
import {
  saveSpecToLibrary,
  deleteSpecFromLibrary,
  exportCanvas,
} from '../../services/persistence';
import {
  activateSavedSpecById,
  activateImportedSpecFile,
  startNewCanvasAfterCheckpoint,
  duplicateCurrentSpec,
} from '../../services/canvas-library-session';
import { useCanvasLibraryList } from '../../hooks/useCanvasLibraryList';
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

  const handleSave = useCallback(() => {
    saveSpecToLibrary(spec);
    refresh();
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), FEEDBACK_DISMISS_MS);
  }, [spec, refresh]);

  const handleLoad = useCallback(
    (specId: string) => {
      if (activateSavedSpecById(specId)) {
        refresh();
        onClose();
      }
    },
    [refresh, onClose],
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
      deleteSpecFromLibrary(specId);
      refresh();
    },
    [refresh],
  );

  const handleExport = useCallback(() => {
    exportCanvas(spec);
  }, [spec]);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await activateImportedSpecFile(file);
        refresh();
        onClose();
      } catch (err) {
        alert(normalizeError(err, 'Import failed'));
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [refresh, onClose],
  );

  const handleDuplicate = useCallback(() => {
    duplicateCurrentSpec();
    refresh();
    onClose();
  }, [refresh, onClose]);

  const handleNew = useCallback(() => {
    startNewCanvasAfterCheckpoint();
    refresh();
    onClose();
  }, [refresh, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Canvas Manager">
      <div className="space-y-4">
        <div className="space-y-1.5 text-xs text-fg-muted">
          <p>
            Saved entries store <strong>spec sections</strong> (left column) only—not the node graph.
            Loading a saved entry resets the graph and compile/generate state. Use <strong>Save Current</strong>{' '}
            to add or update your work in the list below.
          </p>
          <p>
            Renaming in the header updates this document immediately; if it already has a library entry,
            the list title updates automatically after a short delay.
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-nano font-medium uppercase tracking-wide text-fg-muted">
            Currently editing
          </p>
          <p className="text-sm font-medium text-fg-secondary">{spec.title}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1 rounded-md bg-fg px-3 py-1.5 text-xs font-medium text-bg hover:bg-fg/90"
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
            className="rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface"
            title="Saves your current work, then starts a blank spec and resets the graph"
          >
            New Canvas
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface"
            title="Saves current work, then opens a copy with new id (graph reset to match the copy)"
          >
            <Copy size={12} />
            Duplicate
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface"
            title="Download spec document as JSON (sections + metadata)"
          >
            <Download size={12} />
            Export JSON
          </button>
          <label
            className="flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface"
            title="Replace session with a previously exported JSON file (graph resets)"
          >
            <Upload size={12} />
            Import JSON
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
            <h3 className="mb-2 text-xs font-medium text-fg-secondary">
              Saved Canvases
            </h3>
            <div className="space-y-1">
              {specs.map((s) => {
                const isActive = s.id === spec.id;
                return (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                      isActive
                        ? 'border-accent bg-info-subtle'
                        : 'border-border-subtle hover:bg-surface'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => !isActive && handleLoad(s.id)}
                      disabled={isActive}
                      className="flex-1 min-w-0 text-left"
                    >
                      <span
                        className={`text-sm font-medium ${isActive ? 'text-info' : 'text-fg-secondary'}`}
                      >
                        {s.title}
                      </span>
                      {isActive && (
                        <span className="ml-2 inline-block rounded bg-accent-subtle px-1.5 py-0.5 text-nano font-medium text-info">
                          Active
                        </span>
                      )}
                      <span className="ml-2 text-xs text-fg-muted">
                        {new Date(s.lastModified).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id, s.title)}
                      disabled={isActive}
                      className={`ml-2 rounded p-1 ${
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
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-fg-muted">
            No saved canvases yet. Click &ldquo;Save Current&rdquo; to save your
            work.
          </p>
        )}
      </div>
    </Modal>
  );
}
