import { type ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useLineageDim } from '../../../hooks/useLineageDim';
import { useCanvasStore } from '../../../stores/canvas-store';
import { isValidConnection } from '../../../lib/canvas-connections';
import { type NodeStatus } from '../../../constants/canvas';
import { railClassFor } from './node-shell-rail';

export type NodeBorderStatus = NodeStatus;

const BORDER_CLASSES: Record<NodeBorderStatus, string> = {
  selected: 'border-accent',
  processing: 'border-accent-border-medium',
  error: 'border-error-border-medium',
  dimmed: 'border-border-section-divider',
  filled: 'border-border',
  empty: 'border-dashed border-border',
};

interface NodeShellProps {
  nodeId: string;
  nodeType: string;
  selected: boolean;
  width: string;
  status: NodeBorderStatus;
  className?: string;
  hasTarget?: boolean;
  hasSource?: boolean;
  handleColor?: 'amber' | 'green';
  targetShape?: 'circle' | 'diamond';
  targetPulse?: boolean;
  leftRail?: 'success' | 'warning' | null;
  children: ReactNode;
}

export default function NodeShell({
  nodeId,
  nodeType,
  selected,
  width,
  status,
  className,
  hasTarget = true,
  hasSource = true,
  handleColor = 'amber',
  targetShape = 'circle',
  targetPulse = false,
  leftRail,
  children,
}: NodeShellProps) {
  const lineageDim = useLineageDim(nodeId, selected);
  const connectingFrom = useCanvasStore((s) => s.connectingFrom);

  const borderClass = selected ? BORDER_CLASSES.selected : BORDER_CLASSES[status];
  const railClass = railClassFor(leftRail);

  const isGreen = handleColor === 'green';
  const handleFill = isGreen ? '!bg-success' : '!bg-warning';

  let targetGlow = '';
  let sourceGlow = '';
  if (connectingFrom) {
    if (connectingFrom.handleType === 'source' && hasTarget) {
      targetGlow = isValidConnection(connectingFrom.nodeType, nodeType)
        ? 'handle-glow-valid' : 'handle-glow-dim';
    }
    if (connectingFrom.handleType === 'target' && hasSource) {
      sourceGlow = isValidConnection(nodeType, connectingFrom.nodeType)
        ? 'handle-glow-valid' : 'handle-glow-dim';
    }
  }

  const shapeClass = targetShape === 'diamond' ? 'handle-diamond' : '';
  const pulseClass = targetPulse && !targetGlow ? 'handle-pulse' : '';

  return (
    <div className={`relative ${width} rounded-lg border bg-surface-raised shadow-sm ${borderClass} ${railClass} ${lineageDim} ${className ?? ''}`}>
      {status === 'processing' && !selected && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg border-2 border-accent-border-medium animate-pulse"
        />
      )}
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className={`!h-3 !w-3 !rounded-full !border-2 !border-surface-raised ${handleFill} ${shapeClass} ${pulseClass} ${targetGlow}`}
        />
      )}
      {children}
      {hasSource && (
        <Handle
          type="source"
          position={Position.Right}
          className={`!h-3 !w-3 !rounded-full !border-2 !border-surface-raised ${handleFill} ${sourceGlow}`}
        />
      )}
    </div>
  );
}
