import {
  Download,
  X,
  Minus,
  Plus,
  Maximize2,
  PanelRight,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { ZOOM_MIN, ZOOM_MAX } from '../../../hooks/useVariantZoom';

interface VariantToolbarProps {
  variantName: string;
  isArchived: boolean;
  isBestCurrent?: boolean;
  hasCode: boolean;
  nodeId: string;
  /** All results in this version stack (any status); used to choose X vs remove-node */
  versionStackLength: number;
  stackTotal: number;
  stackIndex: number;
  goNewer: () => void;
  goOlder: () => void;
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  onDownload: () => void;
  onDeleteVersion: () => void;
  onExpand: () => void;
  onOpenWorkspace: () => void;
  onRemove: () => void;
}

export default function VariantToolbar({
  variantName,
  isArchived,
  isBestCurrent = false,
  hasCode,
  versionStackLength,
  stackTotal,
  stackIndex,
  goNewer,
  goOlder,
  zoom,
  zoomIn,
  zoomOut,
  resetZoom,
  onDownload,
  onDeleteVersion,
  onExpand,
  onOpenWorkspace,
  onRemove,
}: VariantToolbarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border-subtle px-2.5 py-1">
      <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
        {variantName}
      </h4>
      {isArchived && (
        <span className="shrink-0 rounded bg-fg-faint/10 px-1.5 py-px text-badge font-medium text-fg-muted">
          Archived
        </span>
      )}
      {!isArchived && isBestCurrent && (
        <span className="shrink-0 rounded bg-success/10 px-1.5 py-px text-badge font-medium text-success">
          Best
        </span>
      )}

      {/* Stack navigation */}
      {stackTotal > 1 && (
        <div className="nodrag flex items-center gap-0.5 text-fg-faint">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goNewer();
            }}
            disabled={stackIndex <= 0}
            className="rounded p-px transition-colors hover:text-fg-muted disabled:opacity-30"
            title="Newer version"
          >
            <ChevronLeft size={10} />
          </button>
          <span className="px-0.5 text-badge tabular-nums">
            {stackIndex + 1}/{stackTotal}
          </span>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goOlder();
            }}
            disabled={stackIndex >= stackTotal - 1}
            className="rounded p-px transition-colors hover:text-fg-muted disabled:opacity-30"
            title="Older version"
          >
            <ChevronRight size={10} />
          </button>
        </div>
      )}

      {/* Zoom controls */}
      {hasCode && (
        <div className="nodrag flex items-center text-fg-faint">
          <button
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN + 0.01}
            className="rounded p-px transition-colors hover:text-fg-muted disabled:opacity-30"
            title="Zoom out"
          >
            <Minus size={8} />
          </button>
          <span
            onClick={resetZoom}
            className="cursor-pointer px-px text-badge font-light tabular-nums transition-colors hover:text-fg-muted"
            title="Reset to auto-fit"
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX - 0.01}
            className="rounded p-px transition-colors hover:text-fg-muted disabled:opacity-30"
            title="Zoom in"
          >
            <Plus size={8} />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="h-3 w-px bg-border-subtle" />
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenWorkspace();
        }}
        className="nodrag rounded p-0.5 text-fg-faint transition-colors hover:text-fg-muted"
        title="Open run workspace"
      >
        <PanelRight size={10} />
      </button>
      {hasCode && (
        <>
          <button
            onClick={onDownload}
            className="nodrag rounded p-0.5 text-fg-faint transition-colors hover:text-fg-muted"
            title={`Download ${variantName}`}
          >
            <Download size={10} />
          </button>
          <button
            onClick={onExpand}
            className="nodrag rounded p-0.5 text-fg-faint transition-colors hover:text-fg-muted"
            title="Full-screen preview"
          >
            <Maximize2 size={10} />
          </button>
          {stackTotal > 1 && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDeleteVersion();
              }}
              className="nodrag rounded p-0.5 text-fg-faint transition-colors hover:bg-error-subtle hover:text-error"
              title="Delete this version"
            >
              <Trash2 size={10} />
            </button>
          )}
        </>
      )}

      <button
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (versionStackLength > 1) onDeleteVersion();
          else onRemove();
        }}
        className="nodrag shrink-0 rounded p-0.5 text-fg-faint transition-colors hover:bg-error-subtle hover:text-error"
        title={
          versionStackLength > 1
            ? 'Remove this version (keep other versions in the stack)'
            : 'Remove variant from canvas'
        }
      >
        <X size={10} />
      </button>
    </div>
  );
}
