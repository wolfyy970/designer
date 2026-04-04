import { useState, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutGrid,
  Map,
  RotateCcw,
  Plus,
  Minus,
  SlidersHorizontal,
  AlignHorizontalSpaceAround,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { fitViewWithDefaults } from '../../lib/canvas-fit-view';
import { useCanvasStore } from '../../stores/canvas-store';
import NodePalette from './NodePalette';

const GAP_STEP = 40;

export default function CanvasToolbar() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const showMiniMap = useCanvasStore((s) => s.showMiniMap);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const colGap = useCanvasStore((s) => s.colGap);
  const autoLayout = useCanvasStore((s) => s.autoLayout);
  const toggleMiniMap = useCanvasStore((s) => s.toggleMiniMap);
  const toggleGrid = useCanvasStore((s) => s.toggleGrid);
  const setColGap = useCanvasStore((s) => s.setColGap);
  const toggleAutoLayout = useCanvasStore((s) => s.toggleAutoLayout);
  const applyAutoLayout = useCanvasStore((s) => s.applyAutoLayout);

  const [showPalette, setShowPalette] = useState(false);
  const [showLayoutPanel, setShowLayoutPanel] = useState(false);
  const paletteRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPalette && !showLayoutPanel) return;
    function handleClick(e: MouseEvent) {
      if (showPalette && paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setShowPalette(false);
      }
      if (showLayoutPanel && layoutRef.current && !layoutRef.current.contains(e.target as Node)) {
        setShowLayoutPanel(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPalette, showLayoutPanel]);

  return (
    <div
      className="absolute bottom-4 left-4 z-10 flex flex-col gap-1 rounded-lg border border-border bg-bg p-1 shadow-sm"
      aria-label="Canvas toolbar"
    >
      <div role="group" aria-labelledby="canvas-toolbar-add-label" className="flex flex-col gap-0.5">
        <span id="canvas-toolbar-add-label" className="sr-only">
          Add nodes
        </span>
        <div className="relative" ref={paletteRef}>
          <ToolButton
            icon={<Plus size={16} />}
            label="Add node"
            onClick={() => {
              setShowLayoutPanel(false);
              setShowPalette((v) => !v);
            }}
            active={showPalette}
          />
          {showPalette && (
            <div className="absolute bottom-0 left-full ml-2">
              <NodePalette
                onAdd={(type, pos) => {
                  useCanvasStore.getState().addNode(type, pos);
                  setShowPalette(false);
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div
        role="group"
        aria-labelledby="canvas-toolbar-view-label"
        className="mt-1 flex flex-col gap-0.5 border-t border-border-subtle pt-1.5"
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
        <ToolButton
          icon={<LayoutGrid size={16} />}
          label="Toggle grid"
          onClick={toggleGrid}
          active={showGrid}
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
            label="Layout: auto-layout, tidy, column spacing"
            onClick={() => {
              setShowPalette(false);
              setShowLayoutPanel((v) => !v);
            }}
            active={showLayoutPanel}
          />
          {showLayoutPanel && (
            <div className="absolute bottom-0 left-full ml-2 w-44 rounded-lg border border-border bg-bg p-2 shadow-sm">
              <p className="mb-2 text-nano font-semibold uppercase tracking-wider text-fg-muted">
                Layout
              </p>
              <div className="flex flex-col gap-2">
                <ToolButton
                  icon={<AlignHorizontalSpaceAround size={16} />}
                  label={autoLayout ? 'Auto layout on (click to disable)' : 'Auto layout off (click to enable)'}
                  onClick={() => toggleAutoLayout()}
                  active={autoLayout}
                  className="w-full justify-start gap-2 px-2"
                  showLabel
                  textLabel="Auto layout"
                />
                <button
                  type="button"
                  onClick={() => applyAutoLayout()}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-fg-secondary transition-colors hover:bg-surface"
                >
                  <RotateCcw size={16} className="shrink-0 text-fg-muted" />
                  Tidy up
                </button>
                <div>
                  <div className="mb-1 text-nano text-fg-muted">Column spacing</div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setColGap(colGap - GAP_STEP)}
                      className="rounded p-1 text-fg-secondary hover:bg-surface disabled:opacity-30"
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
                      className="rounded p-1 text-fg-secondary hover:bg-surface disabled:opacity-30"
                      disabled={colGap >= 320}
                      title="Increase spacing"
                      aria-label="Increase column spacing"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
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
