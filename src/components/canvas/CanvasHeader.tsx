import { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Settings, FolderOpen, Pencil, RotateCcw } from 'lucide-react';
import { ThemeToggle } from '@ds/components/ui/theme-toggle';
import { useSpecStore } from '../../stores/spec-store';
import SpecManager from '../shared/SpecManager';
import SettingsModal from '../shared/SettingsModal';
import {
  resetCanvasAfterCheckpoint,
  scheduleLibraryTitleSyncIfEntryExists,
} from '../../services/canvas-library-session';
import { appReleaseLabel } from '../../lib/app-release';

export default function CanvasHeader() {
  const title = useSpecStore((s) => s.spec.title);
  const setTitle = useSpecStore((s) => s.setTitle);
  const settingsEnabled = import.meta.env.DEV;

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [showCanvases, setShowCanvases] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(title);
  }, [title]);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const handleSave = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed) {
      setTitle(trimmed);
      scheduleLibraryTitleSyncIfEntryExists();
      setIsEditing(false);
    } else {
      setEditValue(title);
      setIsEditing(false);
    }
  }, [editValue, title, setTitle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') {
        setEditValue(title);
        setIsEditing(false);
      }
    },
    [handleSave, title]
  );

  return (
    <>
      <div className="absolute top-0 left-0 right-0 z-10 flex h-header items-center justify-between border-b border-border bg-header-scrim px-4 backdrop-blur-sm">
        {/* Left: App identity */}
        <div className="flex w-0 min-w-0 flex-1 items-baseline gap-3">
          <Link
            to="/"
            className="shrink-0 leading-none"
            aria-label="Go to Designer home page"
          >
            <span className="block font-logo text-2xl font-medium leading-none tracking-wide text-fg hover:text-fg-secondary">
              Designer
            </span>
          </Link>
          <span
            className="min-w-0 truncate text-pico leading-none text-fg-muted tabular-nums"
            title={appReleaseLabel()}
          >
            {appReleaseLabel()}
          </span>
        </div>

        {/* Center: Document name */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
          {isEditing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              aria-label="Canvas title"
              className="min-w-[var(--width-canvas-title-min)] max-w-[var(--width-canvas-title)] rounded border border-border px-2 py-0.5 text-center font-sans text-xs font-medium text-fg input-focus"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex max-w-[var(--width-canvas-title)] items-center gap-1.5 truncate font-sans text-xs font-medium text-fg-secondary hover:text-fg"
              aria-label={`Rename canvas: ${title || 'Untitled Canvas'}`}
            >
              <span className="truncate pr-0.5">{title || 'Untitled Canvas'}</span>
              <Pencil size={12} className="shrink-0 text-fg-muted" aria-hidden />
            </button>
          )}
        </div>

        {/* Right: Navigation actions */}
        <div className="flex w-0 min-w-0 flex-1 justify-end items-center gap-1">
          <button
            onClick={() => {
              if (window.confirm('Reset canvas to default template? This clears all nodes.')) {
                void resetCanvasAfterCheckpoint();
              }
            }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-fg-secondary hover:bg-surface-raised"
            title="Reset canvas to default template"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={() => setShowCanvases(true)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-fg-secondary hover:bg-surface-raised"
          >
            <FolderOpen size={14} />
            Canvas Manager
          </button>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => {
              if (settingsEnabled) setShowSettings(true);
            }}
            disabled={!settingsEnabled}
            aria-label={
              settingsEnabled
                ? 'Open settings'
                : 'Settings are available in development only'
            }
            title={
              settingsEnabled
                ? 'Settings'
                : 'Settings are available in development only'
            }
            className="rounded-md p-1.5 text-fg-secondary hover:bg-surface-raised disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <SpecManager open={showCanvases} onClose={() => setShowCanvases(false)} />
      {settingsEnabled ? (
        <SettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </>
  );
}
