import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Columns2, ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { useCompilerStore, findVariantStrategy } from '../../stores/compiler-store';
import { useCanvasStore } from '../../stores/canvas-store';
import { bundleVirtualFS, prepareIframeContent, renderErrorHtml } from '../../lib/iframe-utils';
import { normalizeError } from '../../lib/error-utils';
import { useResultCode } from '../../hooks/useResultCode';
import { useResultFiles } from '../../hooks/useResultFiles';
import { useVersionStack } from '../../hooks/useVersionStack';
import { badgeColor } from '../../lib/badge-colors';
import type { GenerationResult } from '../../types/provider';
import { GENERATION_STATUS } from '../../constants/generation';

export default function VariantPreviewOverlay() {
  // expandedVariantId is now a canvas node ID
  const expandedVariantId = useCanvasStore((s) => s.expandedVariantId);
  const setExpandedVariant = useCanvasStore((s) => s.setExpandedVariant);
  const dimensionMaps = useCompilerStore((s) => s.dimensionMaps);

  // Look up node data from canvas store (primitive selectors for stability)
  const variantStrategyId = useCanvasStore(
    (s) => {
      if (!expandedVariantId) return undefined;
      return s.nodes.find((n) => n.id === expandedVariantId)?.data.variantStrategyId as string | undefined;
    },
  );
  const pinnedRunId = useCanvasStore(
    (s) => {
      if (!expandedVariantId) return undefined;
      return s.nodes.find((n) => n.id === expandedVariantId)?.data.pinnedRunId as string | undefined;
    },
  );

  const [compareId, setCompareId] = useState<string | null>(null);

  const {
    results,
    stack,
    activeResult,
    isActiveBest,
    stackIndex,
    stackTotal,
    goNewer,
    goOlder,
  } = useVersionStack(variantStrategyId, pinnedRunId);

  // Legacy fallback: expandedVariantId might be a resultId from old code
  const legacyResult = useMemo(
    () =>
      !activeResult && expandedVariantId
        ? results.find((r) => r.id === expandedVariantId)
        : undefined,
    [activeResult, expandedVariantId, results],
  );
  const result = activeResult ?? legacyResult;

  // Load code from IndexedDB
  const { code, isLoading: codeLoading } = useResultCode(result?.id, result?.status);
  const { files } = useResultFiles(result?.id, result?.status);
  const compareResult = useMemo(
    () => (compareId ? stack.find((r) => r.id === compareId) : undefined),
    [compareId, stack],
  );
  const { code: compareCode, isLoading: compareCodeLoading } = useResultCode(compareResult?.id, compareResult?.status);
  const { files: compareFiles } = useResultFiles(compareResult?.id, compareResult?.status);

  // Other complete results (for compare mode)
  const otherResults = useMemo(
    () => stack.filter((r: GenerationResult) => r.status === GENERATION_STATUS.COMPLETE && r.id !== result?.id),
    [stack, result?.id],
  );

  const close = useCallback(() => {
    setExpandedVariant(null);
    setCompareId(null);
  }, [setExpandedVariant]);

  // Close on Escape
  useEffect(() => {
    if (!expandedVariantId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expandedVariantId, close]);

  if (!expandedVariantId || !result) return null;

  const strategy = findVariantStrategy(
    dimensionMaps,
    result.variantStrategyId,
  );

  function renderPanel(
    r: GenerationResult,
    panelCode: string | undefined,
    isLoading: boolean,
    panelFiles?: Record<string, string>,
    label?: string,
  ) {
    const strat = findVariantStrategy(dimensionMaps, r.variantStrategyId);
    let content: string | null = null;

    if (panelFiles && Object.keys(panelFiles).length > 0) {
      try {
        content = bundleVirtualFS(panelFiles);
      } catch (err) {
        content = renderErrorHtml(normalizeError(err));
      }
    } else if (panelCode) {
      try {
        content = prepareIframeContent(panelCode);
      } catch (err) {
        content = renderErrorHtml(normalizeError(err));
      }
    }

    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {label && (
          <div className="shrink-0 border-b border-white/10 px-4 py-1.5 text-micro text-white/60">
            {label}
          </div>
        )}
        <div className="shrink-0 border-b border-white/10 px-4 py-2">
          <h3 className="text-sm font-medium text-white">
            {strat?.name ?? 'Variant'}
            {r.runNumber != null && (
              <span
                className={`ml-2 rounded px-1 py-px text-badge font-bold leading-none ${badgeColor(r.runNumber).bg} ${badgeColor(r.runNumber).text}`}
              >
                v{r.runNumber}
              </span>
            )}
          </h3>
          {r.metadata?.model && (
            <p className="text-xs text-white/50">
              {r.metadata.model}
              {r.metadata.durationMs != null && (
                <>
                  {' '}
                  &middot; {(r.metadata.durationMs / 1000).toFixed(1)}s
                </>
              )}
              {r.metadata.tokensUsed != null && (
                <> &middot; {r.metadata.tokensUsed.toLocaleString()} tok</>
              )}
            </p>
          )}
        </div>
        <div className="flex-1 overflow-hidden bg-white">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={20} className="animate-spin text-fg-muted" />
            </div>
          ) : content ? (
            <iframe
              srcDoc={content}
              sandbox="allow-scripts"
              title={`Preview: ${strat?.name ?? 'Variant'}`}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <AlertCircle size={24} className="text-fg-muted" />
              <p className="text-sm text-fg-muted">Code unavailable — may need to regenerate</p>
              <p className="text-xs text-fg-faint">Result ID: {r.id.slice(0, 8)}...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-overlay-heavy">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">
              {strategy?.name ?? 'Variant Preview'}
              {!pinnedRunId && isActiveBest && (
                <span className="ml-2 rounded bg-success/15 px-1.5 py-px text-badge font-medium text-success">
                  Best current
                </span>
              )}
              {pinnedRunId && (
                <span className="ml-2 text-xs font-normal text-white/40">
                  (Archived)
                </span>
              )}
            </h2>
            {result.metadata?.model && (
              <p className="text-xs text-white/40">
                {result.metadata.model}
              </p>
            )}
          </div>

          {/* Version navigation */}
          {stackTotal > 1 && (
            <div className="flex items-center gap-1 text-white/60">
              <button
                onClick={goNewer}
                disabled={stackIndex <= 0}
                className="rounded p-1 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                title="Newer version"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs tabular-nums">
                {stackIndex + 1} / {stackTotal}
              </span>
              <button
                onClick={goOlder}
                disabled={stackIndex >= stackTotal - 1}
                className="rounded p-1 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
                title="Older version"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Compare toggle */}
          {!compareId && otherResults.length > 0 && (
            <button
              onClick={() => setCompareId(otherResults[0].id)}
              className="flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/40 hover:text-white"
            >
              <Columns2 size={14} />
              Compare
            </button>
          )}
          {compareId && (
            <button
              onClick={() => setCompareId(null)}
              className="flex items-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/40 hover:text-white"
            >
              Exit Compare
            </button>
          )}
          <button
            onClick={close}
            className="rounded-md p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {compareId && compareResult ? (
          <>
            {renderPanel(result, code, codeLoading, files, 'Original')}
            <div className="w-px bg-white/10" />
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Compare selector */}
              <div className="shrink-0 border-b border-white/10 px-4 py-1.5">
                <select
                  value={compareId}
                  onChange={(e) => setCompareId(e.target.value)}
                  className="rounded border border-white/20 bg-transparent px-2 py-0.5 text-micro text-white/70 outline-none"
                >
                  {otherResults.map((r) => {
                    const s = findVariantStrategy(
                      dimensionMaps,
                      r.variantStrategyId,
                    );
                    return (
                      <option
                        key={r.id}
                        value={r.id}
                        className="bg-bg text-white"
                      >
                        {s?.name ?? r.metadata?.model ?? r.id}
                        {r.runNumber != null ? ` (v${r.runNumber})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              {renderPanel(compareResult, compareCode, compareCodeLoading, compareFiles)}
            </div>
          </>
        ) : (
          renderPanel(result, code, codeLoading, files)
        )}
      </div>
    </div>
  );
}
