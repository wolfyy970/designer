import { useCallback, useRef, useState, type ReactNode } from 'react';

interface Panel {
  key: string;
  label: string;
  minHeight?: number;
  content: ReactNode;
}

const MIN_RATIO = 0.06;
const DIVIDER_PX = 3;

/**
 * Vertically stacked panels separated by thin draggable dividers.
 * Content sits flush against the label — no extra padding.
 */
export function VerticalResizePanels({ panels }: { panels: Panel[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratios, setRatios] = useState<number[]>(() =>
    panels.map(() => 1 / panels.length),
  );
  const draggingIdx = useRef<number | null>(null);
  const startY = useRef(0);
  const startRatios = useRef<number[]>([]);

  const handlePointerDown = useCallback(
    (idx: number, e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      draggingIdx.current = idx;
      startY.current = e.clientY;
      startRatios.current = [...ratios];
    },
    [ratios],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingIdx.current == null || !containerRef.current) return;
    const idx = draggingIdx.current;
    const containerH = containerRef.current.getBoundingClientRect().height;
    if (containerH === 0) return;

    const delta = (e.clientY - startY.current) / containerH;
    const next = [...startRatios.current];

    next[idx] = Math.max(MIN_RATIO, startRatios.current[idx] + delta);
    next[idx + 1] = Math.max(MIN_RATIO, startRatios.current[idx + 1] - delta);

    if (next[idx] < MIN_RATIO || next[idx + 1] < MIN_RATIO) return;
    setRatios(next);
  }, []);

  const handlePointerUp = useCallback(() => {
    draggingIdx.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {panels.map((panel, i) => (
        <div key={panel.key} className="flex min-h-0 flex-col overflow-hidden" style={{
          flexGrow: ratios[i],
          flexShrink: 1,
          flexBasis: 0,
          minHeight: panel.minHeight ?? 32,
        }}>
          {/* Label — compact, inline with divider */}
          <div className="flex shrink-0 items-center px-3 py-0.5 bg-surface-secondary/40">
            <span className="text-[8px] font-semibold uppercase tracking-widest text-fg-faint">
              {panel.label}
            </span>
          </div>
          {/* Content — flush, scrollable */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {panel.content}
          </div>
          {/* Divider grip */}
          {i < panels.length - 1 && (
            <div
              onPointerDown={(e) => handlePointerDown(i, e)}
              className="group flex shrink-0 cursor-row-resize items-center justify-center border-t border-border-subtle hover:bg-surface-secondary/60"
              style={{ height: DIVIDER_PX }}
            >
              <div className="h-px w-6 rounded-full bg-border transition-colors group-hover:bg-fg-muted" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
