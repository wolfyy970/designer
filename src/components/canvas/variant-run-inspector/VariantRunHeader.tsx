import { Fragment, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@ds/components/ui/button';
import { StatusDot } from '@ds/components/ui/status-dot';
import type { StatusDotVariantProps } from '@ds/components/ui/status-dot-variants';
import { EVALUATOR_WORKER_COUNT } from '../../../types/evaluation';
import { GENERATION_STATUS } from '../../../constants/generation';
import { VARIANT_RUN_TAB_DEFS, type VariantRunTabId } from './variant-run-tabs';

function statusDotProps(status: string): StatusDotVariantProps {
  if (status === GENERATION_STATUS.COMPLETE) return { tone: 'success' };
  if (status === GENERATION_STATUS.GENERATING) return { tone: 'accent', animated: true };
  if (status === GENERATION_STATUS.ERROR) return { tone: 'error' };
  return { tone: 'neutral' };
}

function RunStatusDot({ status }: { status: string }) {
  return <StatusDot {...statusDotProps(status)} aria-hidden />;
}

/**
 * The inspector's identity header and tab bar: run name, version/model/duration/
 * status row, close button, and the tab strip with the live evaluator badge.
 *
 * Extracted from `VariantRunInspector` so the orchestrator does not also carry
 * this markup and its formatting rules.
 *
 * The identity row's separators are emitted positionally (a `·` before the model
 * whenever a model exists, and one before the status unconditionally). For a
 * node with no version and no model that yields a leading `·`, and for a result
 * with no metadata it yields `·complete`. That is the current behaviour and is
 * deliberately preserved here rather than silently corrected — see the audit's
 * open-findings list.
 */
export function VariantRunHeader({
  variantName,
  onClose,
  versionKey,
  runNumber,
  model,
  durationSec,
  statusLabel,
  tab,
  onSelectTab,
  showEvaluationTabBadge,
  evalWorkersDoneCount,
}: {
  variantName: string;
  onClose: () => void;
  /** Present only when a strategy is resolved; gates the version chip. */
  versionKey: string | undefined;
  runNumber: number | undefined;
  model: string | undefined;
  durationSec: string | undefined;
  statusLabel: string;
  tab: VariantRunTabId;
  onSelectTab: (tab: VariantRunTabId) => void;
  showEvaluationTabBadge: boolean;
  evalWorkersDoneCount: number;
}) {
  /**
   * The identity row, in order. A segment is present only when it has content,
   * so the separators are a function of what actually rendered.
   */
  const identitySegments: { key: string; node: ReactNode }[] = [];
  if (versionKey && runNumber != null) {
    identitySegments.push({
      key: 'version',
      node: <span className="tabular-nums text-fg-secondary">v{runNumber}</span>,
    });
  }
  if (model) {
    identitySegments.push({ key: 'model', node: <span className="truncate">{model}</span> });
  }
  if (durationSec) {
    identitySegments.push({
      key: 'duration',
      node: <span className="tabular-nums">{durationSec}s</span>,
    });
  }
  identitySegments.push({
    key: 'status',
    node: (
      <span className="flex items-center gap-1 capitalize">
        <RunStatusDot status={statusLabel} />
        {statusLabel}
      </span>
    ),
  });

  return (
    <>
      {/* ── Identity header ──────────────────────────────────── */}
      <div className="shrink-0 border-b border-border-subtle px-3 py-1.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold leading-tight text-fg">
            {variantName}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="iconSm" onClick={onClose} title="Close (Esc)">
              <X size={14} />
            </Button>
          </div>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-nano text-fg-muted">
          {/*
            Segments are joined, rather than each carrying its own leading `·`.
            The old markup emitted the separator before the model whenever a
            model existed — and one before the status unconditionally — so a node
            with no version chip rendered `·<model>·complete` and a result with no
            metadata rendered `·complete`: a separator with nothing to its left.
            Collecting the segments first makes that unreachable.
          */}
          {identitySegments.map((segment, i) => (
            <Fragment key={segment.key}>
              {i > 0 && <span className="text-border">&middot;</span>}
              {segment.node}
            </Fragment>
          ))}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border-subtle px-2 py-1">
        {VARIANT_RUN_TAB_DEFS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelectTab(id)}
            className={`flex shrink-0 items-center rounded px-2 py-0.5 text-nano font-medium transition-colors ${
              tab === id ? 'bg-surface-nested text-fg' : 'text-fg-muted hover:text-fg-secondary'
            }`}
          >
            {label}
            {id === 'evaluation' && showEvaluationTabBadge ? (
              <>
                <StatusDot tone="accent" animated className="ml-1" aria-hidden />
                <span className="ml-0.5 shrink-0 tabular-nums text-fg-faint">
                  ({evalWorkersDoneCount}/{EVALUATOR_WORKER_COUNT})
                </span>
              </>
            ) : null}
          </button>
        ))}
      </div>
    </>
  );
}
