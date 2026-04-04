import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';
import { X } from 'lucide-react';
import { useCanvasStore, type EdgeStatus } from '../../../stores/canvas-store';
import { EDGE_STATUS } from '../../../constants/canvas';

type DataFlowEdgeData = { status: EdgeStatus };
type DataFlowEdge = Edge<DataFlowEdgeData, 'dataFlow'>;

const STATUS_COLORS: Record<EdgeStatus, string> = {
  [EDGE_STATUS.IDLE]: 'var(--color-fg-muted)',
  [EDGE_STATUS.PROCESSING]: 'var(--color-info)',
  [EDGE_STATUS.COMPLETE]: 'var(--color-fg-muted)',
  [EDGE_STATUS.ERROR]: 'var(--color-error)',
};

export default function DataFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<DataFlowEdge>) {
  const status = data?.status ?? EDGE_STATUS.IDLE;
  const removeEdge = useCanvasStore((s) => s.removeEdge);
  const lineageEdgeIds = useCanvasStore((s) => s.lineageEdgeIds);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const lineageActive = lineageEdgeIds.size > 0;
  const inLineage = lineageEdgeIds.has(id);

  const baseColor = STATUS_COLORS[status];
  const color = selected
    ? 'var(--color-info)'
    : lineageActive && inLineage
      ? 'var(--color-accent)'
      : baseColor;
  const opacity = lineageActive && !inLineage && !selected ? 0.15 : 1;
  const isProcessing = status === EDGE_STATUS.PROCESSING;

  return (
    <>
      {/* Wider invisible path for easier click target */}
      <path
        d={edgePath}
        stroke="transparent"
        strokeWidth={20}
        fill="none"
        className="react-flow__edge-interaction"
      />
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: selected ? 2.5 : lineageActive && inLineage ? 2.5 : 2,
          strokeDasharray: isProcessing ? '8 4' : undefined,
          opacity,
          transition: 'opacity 0.3s, stroke 0.3s',
          filter: lineageActive && inLineage && !selected
            ? 'drop-shadow(0 0 3px var(--color-accent-glow))'
            : undefined,
        }}
      />
      {isProcessing && (
        <BaseEdge
          id={`${id}-animated`}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: 2,
            strokeDasharray: '8 4',
            opacity,
            animation: 'dashmove 0.6s linear infinite',
          }}
        />
      )}
      {/* Delete button at midpoint when selected */}
      {selected && (
        <EdgeLabelRenderer>
          <button
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-fg-muted shadow-sm transition-colors hover:border-error-border-soft hover:bg-error-subtle hover:text-error"
            onClick={() => removeEdge(id)}
            title="Remove connection"
          >
            <X size={12} />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
