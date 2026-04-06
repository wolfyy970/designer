import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_PARTITION_MIN_PCT,
  moveHandleByPercentDelta,
  nudgeHandle,
  setSegmentPercent,
} from '../../lib/partition-slider-utils';

export interface PartitionSegment {
  id: string;
  label: string;
}

export interface PartitionSliderProps {
  segments: PartitionSegment[];
  /** Integers 0–100 per segment id; must sum to 100 */
  values: Record<string, number>;
  onChange: (values: Record<string, number>) => void;
  /** Minimum percent per segment (default 1) */
  min?: number;
}

type DragState = {
  handleIndex: number;
  startX: number;
  startValues: Record<string, number>;
  width: number;
  pointerId: number;
};

export function PartitionSlider({
  segments,
  values,
  onChange,
  min = DEFAULT_PARTITION_MIN_PCT,
}: PartitionSliderProps) {
  const orderedIds = segments.map((s) => s.id);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const applyPointerMove = useCallback(
    (clientX: number) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaX = clientX - d.startX;
      const deltaPct = d.width > 0 ? (deltaX / d.width) * 100 : 0;
      const next = moveHandleByPercentDelta(
        orderedIds,
        d.startValues,
        d.handleIndex,
        deltaPct,
        min,
      );
      if (next) onChange(next);
    },
    [orderedIds, min, onChange],
  );

  const endDrag = useCallback((pointerId: number, target: HTMLElement | null) => {
    if (dragRef.current?.pointerId === pointerId) {
      try {
        target?.releasePointerCapture(pointerId);
      } catch {
        // already released
      }
      dragRef.current = null;
      setActiveHandle(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      dragRef.current = null;
    };
  }, []);

  const handlePointerDown = (handleIndex: number, e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    dragRef.current = {
      handleIndex,
      startX: e.clientX,
      startValues: { ...values },
      width: rect.width,
      pointerId: e.pointerId,
    };
    setActiveHandle(handleIndex);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    applyPointerMove(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    endDrag(e.pointerId, e.currentTarget);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    endDrag(e.pointerId, e.currentTarget);
  };

  const onHandleKeyDown = (handleIndex: number, e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.shiftKey ? 5 : 1;
    const next =
      e.key === 'ArrowRight'
        ? nudgeHandle(orderedIds, values, handleIndex, 'right', step, min)
        : nudgeHandle(orderedIds, values, handleIndex, 'left', step, min);
    if (next) onChange(next);
  };

  const startEdit = (segmentId: string) => {
    setEditingId(segmentId);
    setEditText(String(values[segmentId] ?? 0));
  };

  const commitEdit = () => {
    if (!editingId) return;
    const idx = orderedIds.indexOf(editingId);
    if (idx < 0) {
      setEditingId(null);
      return;
    }
    const n = Number(editText);
    if (!Number.isFinite(n)) {
      setEditingId(null);
      return;
    }
    const next = setSegmentPercent(orderedIds, values, idx, n, min);
    if (next) onChange(next);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  let cum = 0;
  const handlePositions: number[] = [];
  for (let i = 0; i < orderedIds.length - 1; i++) {
    cum += values[orderedIds[i]!]!;
    handlePositions.push(cum);
  }

  return (
    <div
      ref={trackRef}
      className="relative mt-2 flex h-12 w-full select-none overflow-hidden rounded-md border border-border-subtle"
    >
      {segments.map((seg, i) => {
        const pct = values[seg.id] ?? 0;
        return (
          <div
            key={seg.id}
            className={`flex min-h-0 min-w-0 flex-col justify-center gap-0.5 px-1 ${
              i % 2 === 0 ? 'bg-surface-raised' : 'bg-surface'
            }`}
            style={{ flex: `0 0 ${pct}%` }}
          >
            <span className="truncate text-pico font-medium uppercase tracking-wide text-fg-muted">
              {seg.label}
            </span>
            {editingId === seg.id ? (
              <input
                type="number"
                min={min}
                max={100 - (orderedIds.length - 1) * min}
                value={editText}
                onChange={(ev) => setEditText(ev.target.value)}
                onBlur={commitEdit}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') commitEdit();
                  if (ev.key === 'Escape') cancelEdit();
                }}
                className="nodrag w-full min-w-0 rounded border border-border bg-bg px-1 py-0.5 text-nano tabular-nums text-fg-secondary input-focus"
                autoFocus
                aria-label={`${seg.label} percent`}
              />
            ) : (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => startEdit(seg.id)}
                className="nodrag w-fit min-w-0 text-left text-nano tabular-nums text-fg-secondary hover:text-fg"
              >
                {pct}%
              </button>
            )}
          </div>
        );
      })}

      {handlePositions.map((leftPct, handleIndex) => {
        const leftId = orderedIds[handleIndex]!;
        const leftLabel = segments[handleIndex]!.label;
        const rightLabel = segments[handleIndex + 1]!.label;
        const isActive = activeHandle === handleIndex;
        return (
          <button
            key={`handle-${handleIndex}`}
            type="button"
            tabIndex={0}
            role="separator"
            aria-orientation="horizontal"
            aria-label={`Adjust split between ${leftLabel} and ${rightLabel}`}
            aria-valuenow={values[leftId]}
            aria-valuemin={min}
            aria-valuemax={100 - min}
            className={`group absolute top-0 z-10 flex h-full w-4 -translate-x-1/2 cursor-col-resize items-center justify-center border-0 bg-transparent px-1 ${
              isActive ? 'ring-1 ring-accent ring-inset' : ''
            } `}
            style={{ left: `${leftPct}%` }}
            onPointerDown={(e) => handlePointerDown(handleIndex, e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onKeyDown={(e) => onHandleKeyDown(handleIndex, e)}
          >
            <span className="pointer-events-none h-8 w-px shrink-0 rounded-full bg-border group-hover:bg-fg-secondary" />
          </button>
        );
      })}
    </div>
  );
}
