import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings, FolderOpen, Pencil, ScrollText, RotateCcw } from 'lucide-react';
import { useSpecStore } from '../../stores/spec-store';
import { useCanvasStore } from '../../stores/canvas-store';
import SpecManager from '../shared/SpecManager';
import SettingsModal from '../shared/SettingsModal';
import LogViewer from './LogViewer';
import { parsePromptKey } from '../../lib/prompt-log-mapping';
import type { PromptKey } from '../../stores/prompt-store';
import { scheduleLibraryTitleSyncIfEntryExists } from '../../services/canvas-library-session';
import { appReleaseLabel } from '../../lib/app-release';

export default function CanvasHeader() {
  const title = useSpecStore((s) => s.spec.title);
  const setTitle = useSpecStore((s) => s.setTitle);
  const resetCanvas = useCanvasStore((s) => s.resetCanvas);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [showCanvases, setShowCanvases] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'prompts' | undefined>();
  const [settingsPromptKey, setSettingsPromptKey] = useState<PromptKey | undefined>();

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const settings = searchParams.get('settings');
    const promptKeyRaw = searchParams.get('promptKey');
    if (settings !== 'prompts') return;

    const key = promptKeyRaw ? parsePromptKey(promptKeyRaw) : null;
    setSettingsInitialTab('prompts');
    setSettingsPromptKey(key ?? undefined);
    setShowSettings(true);

    const next = new URLSearchParams(searchParams);
    next.delete('settings');
    next.delete('promptKey');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
      <div className="absolute top-0 left-0 right-0 z-10 flex h-header items-center justify-between border-b border-border bg-bg/90 px-4 backdrop-blur-sm">
        {/* Left: App identity */}
        <div className="flex w-0 min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <span className="font-logo text-base font-medium tracking-wide text-fg shrink-0">AutoDesigner</span>
          <span
            className="min-w-0 truncate text-nano text-fg-muted tabular-nums"
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
              className="min-w-[12rem] max-w-[min(28rem,calc(100vw-8rem))] rounded border border-border px-2 py-0.5 text-sm text-fg text-center input-focus"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex max-w-[min(28rem,calc(100vw-8rem))] items-center gap-1.5 truncate text-sm text-fg-secondary hover:text-fg"
              aria-label={`Rename canvas: ${title || 'Untitled Canvas'}`}
            >
              <span className="truncate">{title || 'Untitled Canvas'}</span>
              <Pencil size={12} className="shrink-0 text-fg-muted" aria-hidden />
            </button>
          )}
        </div>

        {/* Right: Navigation actions */}
        <div className="flex w-0 min-w-0 flex-1 justify-end items-center gap-1">
          <button
            onClick={() => {
              if (window.confirm('Reset canvas to default template? This clears all nodes.')) {
                resetCanvas();
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
          <button
            onClick={() => setShowLogs(true)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-fg-secondary hover:bg-surface-raised"
            title="LLM Call Log"
          >
            <ScrollText size={14} />
            Logs
          </button>
          <button
            onClick={() => {
              setSettingsInitialTab(undefined);
              setSettingsPromptKey(undefined);
              setShowSettings(true);
            }}
            className="rounded-md p-1.5 text-fg-secondary hover:bg-surface-raised"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <SpecManager open={showCanvases} onClose={() => setShowCanvases(false)} />
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        initialTab={settingsInitialTab}
        initialPromptKey={settingsPromptKey}
      />
      <LogViewer
        open={showLogs}
        onClose={() => setShowLogs(false)}
        onOpenPromptStudio={(key) => {
          setShowLogs(false);
          setSettingsInitialTab('prompts');
          setSettingsPromptKey(key);
          setShowSettings(true);
        }}
      />
    </>
  );
}
