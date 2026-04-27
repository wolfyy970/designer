import { useState, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Map,
  Plus,
  Minus,
  SlidersHorizontal,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { fitViewWithDefaults } from '../../lib/canvas-fit-view';
import { useCanvasStore } from '../../stores/canvas-store';

const GAP_STEP = 40;

export default function CanvasToolbar() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const showMiniMap = useCanvasStore((s) => s.showMiniMap);
  const colGap = useCanvasStore((s) => s.colGap);
  const toggleMiniMap = useCanvasStore((s) => s.toggleMiniMap);
  const setColGap = useCanvasStore((s) => s.setColGap);

  const [showLayoutPanel, setShowLayoutPanel] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showLayoutPanel) return;
    function handleClick(e: MouseEvent) {
      if (showLayoutPanel && layoutRef.current && !layoutRef.current.contains(e.target as Node)) {
        setShowLayoutPanel(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showLayoutPanel]);

  return (
    <div
      className="absolute bottom-4 left-4 z-10 flex flex-col gap-1 rounded-lg border border-border bg-bg p-1 shadow-sm"
      aria-label="Canvas toolbar"
    >
      <div
        role="group"
        aria-labelledby="canvas-toolbar-view-label"
        className="flex flex-col gap-0.5"
      >
        <span id="canvas-toolbar-view-label" className="sr-only">
          Zoom and display
        </span>
        <ToolButton
          icon={<ZoomIn size={16} />}
          label="Zoom in"
          onClick={() => zoomIn({ duration: 200 })}
        />
        <ToolButton
          icon={<ZoomOut size={16} />}
          label="Zoom out"
          onClick={() => zoomOut({ duration: 200 })}
        />
        <ToolButton
          icon={<Maximize2 size={16} />}
          label="Fit view"
          onClick={() => fitViewWithDefaults(fitView)}
        />
        <ToolButton
          icon={<Map size={16} />}
          label="Toggle minimap"
          onClick={toggleMiniMap}
          active={showMiniMap}
        />
      </div>

      <div
        role="group"
        aria-labelledby="canvas-toolbar-layout-label"
        className="relative mt-1 border-t border-border-subtle pt-1.5"
      >
        <span id="canvas-toolbar-layout-label" className="sr-only">
          Layout
        </span>
        <div ref={layoutRef}>
          <ToolButton
            icon={<SlidersHorizontal size={16} />}
            label="Column spacing"
            onClick={() => setShowLayoutPanel((v) => !v)}
            active={showLayoutPanel}
          />
          {showLayoutPanel && (
            <div className="absolute bottom-0 left-full ml-2 w-44 rounded-lg border border-border bg-bg p-3 shadow-sm">
              <p className="mb-2 text-nano font-semibold uppercase tracking-wider text-fg-muted">
                Column spacing
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setColGap(colGap - GAP_STEP)}
                  className="rounded p-1 text-fg-secondary hover:bg-surface disabled:cursor-not-allowed disabled:text-fg-faint"
                  disabled={colGap <= 80}
                  title="Decrease spacing"
                  aria-label="Decrease column spacing"
                >
                  <Minus size={14} />
                </button>
                <span className="min-w-[3ch] flex-1 text-center text-nano text-fg-secondary">{colGap}</span>
                <button
                  type="button"
                  onClick={() => setColGap(colGap + GAP_STEP)}
                  className="rounded p-1 text-fg-secondary hover:bg-surface disabled:cursor-not-allowed disabled:text-fg-faint"
                  disabled={colGap >= 320}
                  title="Increase spacing"
                  aria-label="Increase column spacing"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
  active,
  className = '',
  showLabel,
  textLabel,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  className?: string;
  showLabel?: boolean;
  textLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex items-center justify-center rounded p-1.5 transition-colors ${
        active
          ? 'bg-surface-raised text-fg'
          : 'text-fg-secondary hover:bg-surface hover:text-fg-secondary'
      } ${className}`}
    >
      {icon}
      {showLabel && textLabel ? <span className="text-xs">{textLabel}</span> : null}
    </button>
  );
}
