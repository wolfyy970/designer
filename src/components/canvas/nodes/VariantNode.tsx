import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TodoItem } from '../../../types/provider';
import type { AggregatedEvaluationReport, EvaluationRoundSnapshot } from '../../../types/evaluation';
import { type NodeProps, type Node } from '@xyflow/react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useGenerationStore } from '../../../stores/generation-store';
import { normalizeError } from '../../../lib/error-utils';
import { useCompilerStore, findVariantStrategy } from '../../../stores/compiler-store';
import { bundleVirtualFS, prepareIframeContent, renderErrorHtml } from '../../../lib/iframe-utils';
import { useCanvasStore } from '../../../stores/canvas-store';
import type { VariantNodeData } from '../../../types/canvas-data';
import { useNodeRemoval } from '../../../hooks/useNodeRemoval';
import { useResultCode } from '../../../hooks/useResultCode';
import { useResultFiles } from '../../../hooks/useResultFiles';
import { useVersionStack } from '../../../hooks/useVersionStack';
import { useVariantZoom } from '../../../hooks/useVariantZoom';
import { useElapsedTimer } from '../../../hooks/useElapsedTimer';
import { variantStatus } from '../../../lib/node-status';
import { GENERATION_STATUS } from '../../../constants/generation';
import { downloadFilesAsZip } from '../../../lib/zip-utils';
import NodeShell from './NodeShell';
import VariantToolbar from './VariantToolbar';
import VariantFooter from './VariantFooter';
import FileExplorer from './FileExplorer';

type VariantNodeType = Node<VariantNodeData, 'variant'>;

function BrowserQASection({ snapshot }: { snapshot?: EvaluationRoundSnapshot }) {
  const browserReport = snapshot?.browser;
  if (!browserReport) return null;

  const runtimeErr = browserReport.findings.filter((f) => f.summary === 'JS runtime error');
  const otherFindings = browserReport.findings.filter((f) => f.summary !== 'JS runtime error');
  const jsScore = browserReport.scores['js_runtime']?.score;
  const interactiveScore = browserReport.scores['interactive_elems']?.score;
  const hasHardFails = browserReport.hardFails.length > 0;

  const statusColor = hasHardFails || (jsScore !== undefined && jsScore <= 2)
    ? 'text-error'
    : runtimeErr.length > 0
      ? 'text-warning'
      : 'text-fg-faint';

  return (
    <div className="border-t border-border-subtle px-3 pt-1.5 pb-2 shrink-0">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-[9px] font-medium uppercase tracking-wider ${statusColor}`}>
          Runtime QA
        </span>
        {jsScore !== undefined && (
          <span className="tabular-nums font-mono text-[10px] text-fg-faint ml-auto">
            JS {jsScore}/5 · CTA {interactiveScore ?? '?'}/5
          </span>
        )}
      </div>
      {browserReport.hardFails.length > 0 && (
        <div className="text-[10px] text-error mb-1">
          {browserReport.hardFails.map((hf) => hf.message.slice(0, 80)).join(' · ')}
        </div>
      )}
      {runtimeErr.length > 0 && (
        <ul className="list-disc pl-3 text-[10px] text-warning space-y-0.5 leading-snug mb-1">
          {runtimeErr.slice(0, 2).map((f, i) => (
            <li key={i} className="truncate" title={f.detail}>{f.detail.slice(0, 90)}</li>
          ))}
        </ul>
      )}
      {otherFindings.length > 0 && (
        <ul className="list-disc pl-3 text-[10px] text-fg-muted space-y-0.5 leading-snug">
          {otherFindings.slice(0, 2).map((f, i) => (
            <li key={i}>{f.summary}</li>
          ))}
        </ul>
      )}
      {browserReport.artifacts?.browserScreenshot?.base64 && (
        <img
          className="mt-1.5 w-full max-h-24 object-cover object-top rounded border border-border-subtle"
          alt="Headless browser capture"
          src={`data:${browserReport.artifacts.browserScreenshot.mediaType};base64,${browserReport.artifacts.browserScreenshot.base64}`}
        />
      )}
    </div>
  );
}

function EvaluationScorecard({
  summary,
  latestSnapshot,
}: {
  summary: AggregatedEvaluationReport;
  latestSnapshot?: EvaluationRoundSnapshot;
}) {
  return (
    <div className="nodrag nowheel border-t border-border-subtle px-3 py-2 shrink-0 max-h-[180px] overflow-y-auto bg-surface-secondary/50">
      <div className="flex justify-between items-center mb-1 gap-2">
        <span className="text-[9px] font-medium uppercase tracking-wider text-fg-faint">
          Eval · {summary.shouldRevise ? 'revise suggested' : 'pass'}
        </span>
        <span className="tabular-nums font-mono text-[11px] text-accent">
          {summary.overallScore.toFixed(1)}
        </span>
      </div>
      {summary.hardFails.length > 0 && (
        <div className="text-[10px] text-error mb-1">
          {summary.hardFails.filter((hf) => hf.source !== 'browser').length > 0 && (
            <span>{summary.hardFails.filter((hf) => hf.source !== 'browser').length} design/strategy fail(s) · </span>
          )}
        </div>
      )}
      <ul className="list-disc pl-3 text-[10px] text-fg-muted space-y-0.5 leading-snug">
        {summary.prioritizedFixes
          .filter((f) => !f.startsWith('[hard_fail:missing_assets') && !f.startsWith('[hard_fail:js_') && !f.startsWith('[hard_fail:empty_'))
          .slice(0, 4)
          .map((f, i) => (
            <li key={i}>{f}</li>
          ))}
      </ul>
      {latestSnapshot?.browser && <BrowserQASection snapshot={latestSnapshot} />}
    </div>
  );
}

function AgenticHarnessStripe({
  phase,
  evaluationStatus,
}: {
  phase?: string;
  evaluationStatus?: string;
}) {
  if (!phase && !evaluationStatus) return null;
  return (
    <div className="border-b border-border-subtle px-3 py-1.5 shrink-0 bg-surface-secondary/80">
      {phase ? (
        <div className="text-[9px] font-medium uppercase tracking-wider text-fg-faint">{phase}</div>
      ) : null}
      {evaluationStatus ? (
        <div className="text-[10px] text-fg-muted truncate nodrag nowheel" title={evaluationStatus}>
          {evaluationStatus}
        </div>
      ) : null}
    </div>
  );
}

/** Live task checklist shown during agentic generation */
function TodoTracker({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) return null;
  return (
    <div className="border-b border-border-subtle px-3 py-2 shrink-0">
      <div className="text-[9px] font-medium uppercase tracking-wider text-fg-faint mb-1.5">Tasks</div>
      <div className="flex flex-col gap-0.5">
        {todos.map((todo) => (
          <div key={todo.id} className="flex items-start gap-1.5">
            <span className={`mt-px shrink-0 font-mono text-[10px] leading-tight ${
              todo.status === 'completed' ? 'text-accent' :
              todo.status === 'in_progress' ? 'text-fg-secondary' : 'text-fg-faint'
            }`}>
              {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '●' : '○'}
            </span>
            <span className={`text-[10px] leading-tight ${
              todo.status === 'completed' ? 'text-fg-muted line-through' :
              todo.status === 'in_progress' ? 'text-fg-secondary' : 'text-fg-faint'
            }`}>
              {todo.task}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Scrolling terminal-like activity log during generation */
function ActivityLog({ entries }: { entries?: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Streaming token deltas arrive as a single growing string in entries[0]
  const text = entries && entries.length > 0 ? entries.join('') : '';

  useEffect(() => {
    if (!text) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  if (!entries || entries.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-between p-4">
        <div className="flex flex-col gap-2.5">
          <div className="h-4 w-4/5 animate-pulse rounded bg-border/50" />
          <div className="h-3 w-full animate-pulse rounded bg-border/40" style={{ animationDelay: '75ms' }} />
          <div className="h-3 w-[90%] animate-pulse rounded bg-border/40" style={{ animationDelay: '150ms' }} />
          <div className="h-3 w-3/4 animate-pulse rounded bg-border/40" style={{ animationDelay: '225ms' }} />
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="h-3 w-[85%] animate-pulse rounded bg-border/30" style={{ animationDelay: '300ms' }} />
          <div className="h-3 w-full animate-pulse rounded bg-border/30" style={{ animationDelay: '375ms' }} />
          <div className="h-3 w-2/3 animate-pulse rounded bg-border/30" style={{ animationDelay: '450ms' }} />
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="h-3 w-[70%] animate-pulse rounded bg-border/20" style={{ animationDelay: '525ms' }} />
          <div className="h-3 w-[90%] animate-pulse rounded bg-border/20" style={{ animationDelay: '600ms' }} />
          <div className="h-3 w-4/5 animate-pulse rounded bg-border/20" style={{ animationDelay: '675ms' }} />
          <div className="h-3 w-3/5 animate-pulse rounded bg-border/20" style={{ animationDelay: '750ms' }} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="nodrag nowheel min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed"
    >
      <span className="whitespace-pre-wrap italic text-fg-muted">{text}</span>
    </div>
  );
}

function GeneratingFooter({
  plan,
  written,
  progressMessage,
  elapsed,
}: {
  plan: string[] | undefined;
  written: number;
  progressMessage: string | undefined;
  elapsed: number;
}) {
  const total = plan?.length ?? 0;
  const hasPlan = total > 0;
  const progress = hasPlan ? written / total : 0;

  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle px-4 py-3">
      {hasPlan ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-accent/70 transition-all duration-500"
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      ) : (
        <div className="h-1 w-full overflow-hidden rounded-full bg-border">
          <div className="h-full w-full animate-pulse rounded-full bg-accent/60" />
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
          <Loader2 size={10} className="animate-spin text-accent" />
          {hasPlan
            ? `${written} / ${total} files`
            : (progressMessage || 'Generating…')}
        </span>
        <span className="tabular-nums text-xs text-fg-muted">{elapsed}s</span>
      </div>
    </div>
  );
}

function VariantNode({ id, data, selected }: NodeProps<VariantNodeType>) {
  const variantStrategyId = data.variantStrategyId;
  const pinnedRunId = data.pinnedRunId;
  const isArchived = !!pinnedRunId;

  const {
    results,
    stack,
    activeResult,
    completedStack,
    stackIndex,
    stackTotal,
    versionKey,
    goNewer,
    goOlder,
    setSelectedVersion,
  } = useVersionStack(variantStrategyId, pinnedRunId);

  // Legacy fallback: if no variantStrategyId, use refId directly
  const legacyResult = useMemo(
    () =>
      !variantStrategyId && data.refId
        ? results.find((r) => r.id === data.refId)
        : undefined,
    [variantStrategyId, data.refId, results],
  );
  const result = activeResult ?? legacyResult;

  const deleteResult = useGenerationStore((s) => s.deleteResult);

  // Load code from IndexedDB (single-file)
  const { code, isLoading: codeLoading } = useResultCode(result?.id, result?.status);

  // Load files from IndexedDB (multi-file)
  const { files } = useResultFiles(result?.id, result?.status);

  const strategy = useCompilerStore((s) => {
    const vsId = variantStrategyId ?? result?.variantStrategyId;
    if (!vsId) return undefined;
    return findVariantStrategy(s.dimensionMaps, vsId);
  });

  const onRemove = useNodeRemoval(id);
  const setExpandedVariant = useCanvasStore((s) => s.setExpandedVariant);

  const variantName = strategy?.name ?? 'Variant';

  // Tab state for multi-file complete view
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [activeCodeFile, setActiveCodeFile] = useState<string | undefined>(undefined);

  // Track most-recently-written file during generation
  const [writingFile, setWritingFile] = useState<string | undefined>(undefined);
  const prevLiveFilesRef = useRef<Record<string, string> | undefined>(undefined);

  useEffect(() => {
    const lf = result?.liveFiles;
    if (!lf) return;
    const prev = prevLiveFilesRef.current ?? {};
    const newKey = Object.keys(lf).find((k) => !(k in prev));
    if (newKey) {
      setWritingFile(newKey);
      const t = setTimeout(() => setWritingFile(undefined), 1000);
      prevLiveFilesRef.current = lf;
      return () => clearTimeout(t);
    }
    prevLiveFilesRef.current = lf;
  }, [result?.liveFiles]);

  // Determine whether we're in multi-file mode
  const currentFiles = files ?? result?.liveFiles;
  const isMultiFile = !!currentFiles && Object.keys(currentFiles).length > 0;

  // Auto-select code file when switching to code tab
  useEffect(() => {
    if (activeTab === 'code' && !activeCodeFile && currentFiles) {
      const preferred = ['index.html', 'styles.css', 'app.js'];
      const first = preferred.find((p) => p in currentFiles) ?? Object.keys(currentFiles)[0];
      setActiveCodeFile(first);
    }
  }, [activeTab, activeCodeFile, currentFiles]);

  // Bundled HTML for multi-file preview
  const bundledHtml = useMemo(() => {
    if (!currentFiles || Object.keys(currentFiles).length === 0) return '';
    try {
      return bundleVirtualFS(currentFiles);
    } catch (err) {
      return renderErrorHtml(normalizeError(err));
    }
  }, [currentFiles]);

  const handleDeleteVersion = useCallback(async () => {
    if (!result || !versionKey) return;
    const resultId = result.id;
    // Select next version before deleting
    if (stackTotal > 1) {
      const nextResult =
        completedStack.find((r) => r.id !== resultId) ?? stack.find((r) => r.id !== resultId);
      if (nextResult) {
        setSelectedVersion(versionKey, nextResult.id);
      }
    }
    deleteResult(resultId);
  }, [
    result,
    versionKey,
    stackTotal,
    completedStack,
    stack,
    setSelectedVersion,
    deleteResult,
  ]);

  const slug = variantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const handleDownload = useCallback(() => {
    if (files && Object.keys(files).length > 0) {
      downloadFilesAsZip(files, `${slug}.zip`);
    } else if (code) {
      const blob = new Blob([code], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [files, code, slug]);

  const { contentRef, zoom, zoomIn, zoomOut, resetZoom } = useVariantZoom();

  const isGenerating = result?.status === GENERATION_STATUS.GENERATING;
  const elapsed = useElapsedTimer(isGenerating);

  const htmlContent = useMemo(() => {
    if (!code) return '';
    try {
      return prepareIframeContent(code);
    } catch (err) {
      return renderErrorHtml(normalizeError(err));
    }
  }, [code]);

  const hasCode = result?.status === GENERATION_STATUS.COMPLETE && (!!code || isMultiFile);

  const status = variantStatus({
    isArchived,
    isError: result?.status === GENERATION_STATUS.ERROR,
    isGenerating: result?.status === GENERATION_STATUS.GENERATING,
    hasCode,
  });

  const stackClass = stackTotal >= 3
    ? 'variant-stack-deep'
    : stackTotal === 2
      ? 'variant-stack'
      : '';

  return (
    <NodeShell
      nodeId={id}
      nodeType="variant"
      selected={!!selected}
      width="w-node-variant"
      status={status}
      className={`relative flex h-full min-h-[420px] flex-col${isArchived ? ' opacity-75' : ''} ${stackClass}`}
      handleColor={hasCode ? 'green' : 'amber'}
    >
      <VariantToolbar
        variantName={variantName}
        isArchived={isArchived}
        hasCode={hasCode}
        nodeId={id}
        stackTotal={stackTotal}
        stackIndex={stackIndex}
        goNewer={goNewer}
        goOlder={goOlder}
        zoom={zoom}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        resetZoom={resetZoom}
        onDownload={handleDownload}
        onDeleteVersion={handleDeleteVersion}
        onExpand={() => setExpandedVariant(id)}
        onRemove={onRemove}
      />

      {/* ── Content area ──────────────────────────────────────── */}
      <div ref={contentRef} className="relative flex-1 overflow-hidden">

        {/* States 1 & 2: GENERATING */}
        {result?.status === GENERATION_STATUS.GENERATING && (
          <div className="absolute inset-0 flex flex-col bg-surface">
            <div className="flex flex-1 min-h-0 overflow-hidden flex-col">
              {result.liveTodos && result.liveTodos.length > 0 && (
                <TodoTracker todos={result.liveTodos} />
              )}
              <AgenticHarnessStripe
                phase={result.agenticPhase}
                evaluationStatus={result.evaluationStatus}
              />
              {result.evaluationSummary && (
                <EvaluationScorecard
                  summary={result.evaluationSummary}
                  latestSnapshot={result.evaluationRounds?.[result.evaluationRounds.length - 1]}
                />
              )}
              <div className="flex flex-1 min-h-0 overflow-hidden">
              {/* File explorer sidebar — shown once a plan or files exist */}
              {(result.liveFilesPlan || result.liveFiles) && (
                <div className="w-28 shrink-0 border-r border-border-subtle overflow-hidden flex flex-col">
                  <div className="px-2 py-1.5 border-b border-border-subtle">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-fg-faint">Files</span>
                  </div>
                  <FileExplorer
                    files={result.liveFiles ?? {}}
                    plannedFiles={result.liveFilesPlan}
                    activeFile={undefined}
                    onSelectFile={() => {}}
                    isGenerating={true}
                    writingFile={writingFile}
                    className="flex-1"
                  />
                </div>
              )}
              {/* Activity log */}
              <ActivityLog entries={result.activityLog} />
              </div>
            </div>
            {/* Progress footer */}
            <GeneratingFooter
              plan={result.liveFilesPlan}
              written={Object.keys(result.liveFiles ?? {}).length}
              progressMessage={result.progressMessage}
              elapsed={elapsed}
            />
          </div>
        )}

        {/* Error state */}
        {result?.status === GENERATION_STATUS.ERROR && (
          <div className="flex h-full flex-col items-center justify-center bg-error-subtle p-4">
            <AlertCircle size={16} className="mb-2 text-error" />
            <p className="text-center text-xs text-error">
              {result.error ?? 'Generation failed'}
            </p>
          </div>
        )}

        {/* Pending / no result */}
        {(!result || result.status === GENERATION_STATUS.PENDING) && (
          <div className="flex h-full items-center justify-center bg-surface">
            <p className="text-xs text-fg-muted">Waiting...</p>
          </div>
        )}

        {/* State 3: COMPLETE, single-file */}
        {result?.status === GENERATION_STATUS.COMPLETE && !isMultiFile && (
          <>
            {/* Loading code from IndexedDB */}
            {codeLoading && (
              <div className="flex h-full items-center justify-center bg-surface">
                <Loader2 size={14} className="animate-spin text-fg-muted" />
              </div>
            )}

            {/* Complete but code missing from IndexedDB */}
            {!codeLoading && !code && (
              <div className="flex h-full flex-col items-center justify-center bg-surface p-4">
                <AlertCircle size={16} className="mb-2 text-fg-muted" />
                <p className="text-center text-xs text-fg-muted">
                  Code unavailable — may need to regenerate
                </p>
              </div>
            )}

            {/* Complete: rendered preview */}
            {code && (
              <iframe
                srcDoc={htmlContent}
                sandbox="allow-scripts"
                title={`Variant: ${variantName}`}
                className="absolute left-0 top-0 border-0 bg-white"
                style={{
                  width: `${100 / zoom}%`,
                  height: `${100 / zoom}%`,
                  transform: `scale(${zoom})`,
                  transformOrigin: '0 0',
                  pointerEvents: 'auto',
                }}
              />
            )}
          </>
        )}

        {/* State 4: COMPLETE, multi-file — tab bar with preview/code */}
        {result?.status === GENERATION_STATUS.COMPLETE && isMultiFile && (
          <div className="absolute inset-0 flex flex-col">
            {/* Tab bar */}
            <div className="flex border-b border-border-subtle bg-surface shrink-0">
              {(['preview', 'code'] as const).map((tab) => (
                <button
                  key={tab}
                  onPointerDown={() => setActiveTab(tab)}
                  className={`nodrag px-3 py-1.5 text-[10px] font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? 'border-b border-accent text-fg'
                      : 'text-fg-muted hover:text-fg-secondary'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            {/* Preview tab */}
            {activeTab === 'preview' && (
              <div className="relative flex-1 overflow-hidden">
                <iframe
                  srcDoc={bundledHtml}
                  sandbox="allow-scripts"
                  title={`Variant: ${variantName}`}
                  className="absolute left-0 top-0 border-0 bg-white"
                  style={{
                    width: `${100 / zoom}%`,
                    height: `${100 / zoom}%`,
                    transform: `scale(${zoom})`,
                    transformOrigin: '0 0',
                    pointerEvents: 'auto',
                  }}
                />
              </div>
            )}
            {/* Code tab */}
            {activeTab === 'code' && (
              <div className="flex flex-1 overflow-hidden">
                <div className="w-28 shrink-0 border-r border-border-subtle bg-surface flex flex-col">
                  <div className="px-2 py-1.5 border-b border-border-subtle">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-fg-faint">Files</span>
                  </div>
                  <FileExplorer
                    files={currentFiles!}
                    activeFile={activeCodeFile}
                    onSelectFile={setActiveCodeFile}
                    isGenerating={false}
                    className="flex-1"
                  />
                </div>
                <div className="nodrag nowheel flex-1 overflow-auto bg-bg">
                  <pre className="min-h-full p-3 font-mono text-[10px] leading-relaxed text-fg-secondary whitespace-pre-wrap">
                    {activeCodeFile && currentFiles?.[activeCodeFile]}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Evaluation (completed agentic runs) ───────────────── */}
      {result?.status === GENERATION_STATUS.COMPLETE && result.evaluationSummary && (
        <EvaluationScorecard
          summary={result.evaluationSummary}
          latestSnapshot={result.evaluationRounds?.[result.evaluationRounds.length - 1]}
        />
      )}

      {/* ── Metadata footer ─────────────────────────────────── */}
      {result?.status === GENERATION_STATUS.COMPLETE && (
        <VariantFooter result={result} />
      )}
    </NodeShell>
  );
}

export default memo(VariantNode);
