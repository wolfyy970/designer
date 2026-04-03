import {
  Download,
  FileText,
  X,
  Minus,
  Plus,
  Maximize2,
  PanelRight,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Star,
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
  /** Markdown debug bundle (run trace, thinking, eval, code). */
  onDownloadDebug?: () => void;
  onDeleteVersion: () => void;
  onExpand: () => void;
  onToggleWorkspace: () => void;
  isWorkspaceOpen: boolean;
  onRemove: () => void;
  /** User “best” override (same hypothesis lane) */
  showMarkUserBest?: boolean;
  showClearUserBest?: boolean;
  onMarkUserBest?: () => void;
  onClearUserBest?: () => void;
  /** In-flight generation for this hypothesis lane — stop cancels the SSE / agent on the server. */
  showStopGeneration?: boolean;
  onStopGeneration?: () => void;
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
  onDownloadDebug,
  onDeleteVersion,
  onExpand,
  onToggleWorkspace,
  isWorkspaceOpen,
  onRemove,
  showMarkUserBest = false,
  showClearUserBest = false,
  onMarkUserBest,
  onClearUserBest,
  showStopGeneration = false,
  onStopGeneration,
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
      {showStopGeneration && onStopGeneration ? (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStopGeneration();
          }}
          className="nodrag shrink-0 rounded border border-error/35 bg-error-subtle px-1.5 py-px text-badge font-semibold text-error transition-colors hover:bg-error/20"
          title="Stop generation (cancels the in-flight request)"
        >
          Stop
        </button>
      ) : null}

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
      {showClearUserBest && onClearUserBest ? (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClearUserBest();
          }}
          className="nodrag rounded p-0.5 text-warning transition-colors hover:text-warning/85"
          title="Clear your best pick (use evaluator ranking)"
        >
          <Star size={10} className="fill-current" />
        </button>
      ) : null}
      {showMarkUserBest && onMarkUserBest ? (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMarkUserBest();
          }}
          className="nodrag rounded p-0.5 text-fg-faint transition-colors hover:text-fg-muted"
          title="Mark this version as best for this lane"
        >
          <Star size={10} />
        </button>
      ) : null}
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleWorkspace();
        }}
        className={`nodrag rounded p-0.5 transition-colors ${
          isWorkspaceOpen
            ? 'text-accent hover:text-accent/80'
            : 'text-fg-faint hover:text-fg-muted'
        }`}
        title={isWorkspaceOpen ? 'Close run workspace' : 'Open run workspace'}
      >
        <PanelRight size={10} />
      </button>
      {onDownloadDebug ? (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={onDownloadDebug}
          className="nodrag rounded p-0.5 text-fg-faint transition-colors hover:text-fg-muted"
          title="Export debug snapshot (Markdown) — choose sections in the dialog"
        >
          <FileText size={10} />
        </button>
      ) : null}
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
            ? 'Delete this generation version (others stay on the card)'
            : 'Delete variant from canvas'
        }
      >
        <X size={10} />
      </button>
    </div>
  );
}
