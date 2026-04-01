import { useState, useCallback, useRef, useEffect } from 'react';
import { Settings, FolderOpen, Pencil, ScrollText, RotateCcw } from 'lucide-react';
import { useSpecStore } from '../../stores/spec-store';
import { useCanvasStore } from '../../stores/canvas-store';
import SpecManager from '../shared/SpecManager';
import SettingsModal from '../shared/SettingsModal';
import LogViewer from './LogViewer';

export default function CanvasHeader() {
  const title = useSpecStore((s) => s.spec.title);
  const setTitle = useSpecStore((s) => s.setTitle);
  const autoLayout = useCanvasStore((s) => s.autoLayout);
  const toggleAutoLayout = useCanvasStore((s) => s.toggleAutoLayout);
  const resetCanvas = useCanvasStore((s) => s.resetCanvas);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [showCanvases, setShowCanvases] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(title);
  }, [title]);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const handleSave = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed) setTitle(trimmed);
    setIsEditing(false);
  }, [editValue, setTitle]);

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
        <div className="flex w-0 min-w-0 flex-1 items-center gap-3">
          <span className="text-sm font-semibold text-fg shrink-0">Auto Designer</span>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-secondary select-none hover:text-fg shrink-0">
            <input
              type="checkbox"
              checked={autoLayout}
              onChange={toggleAutoLayout}
              className="accent-accent"
            />
            Auto Layout
          </label>
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
              className="rounded border border-border px-2 py-0.5 text-sm text-fg text-center input-focus"
            />
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 text-sm text-fg-secondary hover:text-fg"
            >
              {title || 'Untitled Canvas'}
              <Pencil size={12} className="text-fg-muted" />
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
            onClick={() => setShowSettings(true)}
            className="rounded-md p-1.5 text-fg-secondary hover:bg-surface-raised"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <SpecManager open={showCanvases} onClose={() => setShowCanvases(false)} />
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      <LogViewer open={showLogs} onClose={() => setShowLogs(false)} />
    </>
  );
}
