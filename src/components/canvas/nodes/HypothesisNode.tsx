import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { type NodeProps, type Node, Handle, Position } from '@xyflow/react';
import { FileText, Loader2, Pencil, X, Zap } from 'lucide-react';
import { useIncubatorStore, findStrategy } from '../../../stores/incubator-store';
import { useCanvasStore } from '../../../stores/canvas-store';
import { useGenerationStore } from '../../../stores/generation-store';
import { useSpecStore } from '../../../stores/spec-store';
import { useWorkspaceDomainStore } from '../../../stores/workspace-domain-store';
import { useEvaluatorDefaultsStore } from '../../../stores/evaluator-defaults-store';
import type { HypothesisNodeData } from '../../../types/canvas-data';
import { useHypothesisGeneration } from '../../../hooks/useHypothesisGeneration';
import { useHypothesisAutoGenerate } from '../../../hooks/useHypothesisAutoGenerate';
import { consumePendingAutoGenerate } from '../../../lib/hypothesis-pending-generate';
import { useNodeRemoval } from '../../../hooks/useNodeRemoval';
import { useRequestPermanentDelete } from '../../../hooks/useRequestPermanentDelete';
import { hypothesisDeleteCopy } from '../../../lib/canvas-permanent-delete-copy';
import { processingOrFilled } from '../../../lib/node-status';
import { GENERATION_STATUS } from '../../../constants/generation';
import {
  EVALUATOR_MAX_REVISION_ROUNDS_MAX,
  EVALUATOR_MAX_REVISION_ROUNDS_MIN,
  EVALUATOR_MAX_SCORE,
  EVALUATOR_MIN_SCORE,
} from '../../../types/evaluator-settings';
import { abortGenerationForStrategy } from '../../../lib/generation-abort-registry';
import { NODE_STATUS, NODE_TYPES, RF_INTERACTIVE } from '../../../constants/canvas';
import {
  countIncomingModelsWithModelSelected,
  countOutgoingNodesOfType,
} from '../../../workspace/graph-queries';
import {
  buildHypothesisDebugMarkdown,
  downloadTextFile,
  findPlanForStrategy,
} from '../../../lib/debug-markdown-export';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';
import GeneratingSkeleton from './GeneratingSkeleton';
import { NodeErrorBlock } from './shared/NodeErrorBlock';
import { DsHelpTooltip } from '../../shared/DsHelpTooltip';

type HypothesisEditorTab = 'hypothesis' | 'why' | 'measurements';

const TAB_DEFS: { id: HypothesisEditorTab; label: string }[] = [
  { id: 'hypothesis', label: 'Hypothesis' },
  { id: 'why', label: 'Why' },
  { id: 'measurements', label: 'Measurements' },
];

type HypothesisNodeType = Node<HypothesisNodeData, 'hypothesis'>;

function smallNumberToWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return n <= 10 ? words[n]! : n.toString();
}

function HypothesisNode({ id: nodeId, data, selected }: NodeProps<HypothesisNodeType>) {
  const strategyId = data.refId ?? '';

  const strategy = useIncubatorStore(
    (s) => findStrategy(s.incubationPlans, strategyId),
  );
  const updateStrategy = useIncubatorStore((s) => s.updateStrategy);

  const domainHypothesis = useWorkspaceDomainStore((s) => s.hypotheses[nodeId]);
  const setHypothesisGenerationSettings = useWorkspaceDomainStore(
    (s) => s.setHypothesisGenerationSettings,
  );
  const globalMaxRounds = useEvaluatorDefaultsStore((s) => s.maxRevisionRounds);
  const globalMinScore = useEvaluatorDefaultsStore((s) => s.minOverallScore);

  const revisionEnabled = domainHypothesis?.revisionEnabled ?? false;
  const hypoMaxRounds = domainHypothesis?.maxRevisionRounds;
  const hypoMinScore = domainHypothesis?.minOverallScore;

  const displayMaxRounds = hypoMaxRounds ?? globalMaxRounds;
  const effectiveMinScore =
    hypoMinScore !== undefined ? hypoMinScore : globalMinScore;
  const targetScoreChecked = effectiveMinScore != null;

  const setRevisionEnabled = useCallback(
    (enabled: boolean) => {
      setHypothesisGenerationSettings(nodeId, { revisionEnabled: enabled });
    },
    [nodeId, setHypothesisGenerationSettings],
  );

  const handleRemove = useNodeRemoval(nodeId);
  const { requestPermanentDelete } = useRequestPermanentDelete();

  const connectedModelCount = useCanvasStore((s) =>
    countIncomingModelsWithModelSelected(nodeId, { nodes: s.nodes, edges: s.edges }),
  );

  const isGenerating = useGenerationStore((s) =>
    s.results.some((r) => r.strategyId === strategyId && r.status === GENERATION_STATUS.GENERATING),
  );

  const { handleGenerate, generationProgress, generationError } =
    useHypothesisGeneration({ nodeId, strategyId });

  const hypoAutoGen = useHypothesisAutoGenerate({ nodeId, strategyId });

  // Ref so pending-auto-generate runs the latest generate without depending on callback identity.
  const generateRef = useRef(hypoAutoGen.generate);
  useEffect(() => {
    generateRef.current = hypoAutoGen.generate;
  });

  useEffect(() => {
    if (consumePendingAutoGenerate(nodeId)) {
      void generateRef.current();
    }
  }, [nodeId]);

  const handleStopGeneration = useCallback(() => {
    abortGenerationForStrategy(strategyId);
  }, [strategyId]);

  const [editorTab, setEditorTab] = useState<HypothesisEditorTab>('hypothesis');
  const [editingName, setEditingName] = useState(false);

  const update = useCallback(
    (field: string, value: string) => {
      updateStrategy(strategyId, { [field]: value });
    },
    [strategyId, updateStrategy],
  );

  const handleExportDebugMarkdown = useCallback(() => {
    if (!strategy) return;
    const spec = useSpecStore.getState().spec;
    const incubator = useIncubatorStore.getState();
    const domain = useWorkspaceDomainStore.getState();
    const gen = useGenerationStore.getState();
    const incubationPlan = findPlanForStrategy(incubator.incubationPlans, strategyId);
    const dh = domain.hypotheses[nodeId];
    const compiledPromptsForStrategy = incubator.compiledPrompts.filter(
      (p) => p.strategyId === strategyId,
    );
    const resultsForStrategy = gen.results.filter((r) => r.strategyId === strategyId);
    const md = buildHypothesisDebugMarkdown({
      exportedAt: new Date().toISOString(),
      canvasTitle: spec.title,
      hypothesisNodeId: nodeId,
      strategy,
      incubationPlan,
      domainHypothesis: dh,
      modelProfiles: domain.modelProfiles,
      designSystems: domain.designSystems,
      spec,
      compiledPromptsForStrategy,
      resultsForStrategy,
    });
    const slug = (strategy.name || 'hypothesis')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    downloadTextFile(`${slug}-hypothesis-debug-${stamp}.md`, md);
  }, [strategy, strategyId, nodeId]);

  const handleDelete = useCallback(() => {
    const snap = useCanvasStore.getState();
    const previewCount = countOutgoingNodesOfType(nodeId, NODE_TYPES.PREVIEW, snap);
    const { title, description, confirmLabel, cancelLabel } =
      hypothesisDeleteCopy(previewCount);
    requestPermanentDelete({
      title,
      description,
      confirmLabel,
      cancelLabel,
      onConfirm: handleRemove,
    });
  }, [handleRemove, nodeId, requestPermanentDelete]);

  if (data.placeholder) {
    return (
      <NodeShell
        nodeId={nodeId}
        nodeType="hypothesis"
        selected={!!selected}
        width="w-node"
        status={NODE_STATUS.PROCESSING}
        handleColor="amber"
        targetShape="diamond"
      >
        <NodeHeader onRemove={() => {}}>
          <h3 className="text-xs font-semibold text-fg-secondary">New Hypothesis</h3>
        </NodeHeader>
        <GeneratingSkeleton label="Incubating…" />
      </NodeShell>
    );
  }

  if (!strategy) {
    return (
      <div className="relative w-node rounded-lg border border-dashed border-border bg-surface-raised p-4 text-center text-xs text-fg-muted">
        <Handle type="target" position={Position.Left} className="!h-4 !w-4 !border-2 !border-border !bg-surface-raised" />
        Hypothesis not found
        <button
          onClick={handleDelete}
          className="nodrag absolute right-2 top-2 rounded p-0.5 text-fg-faint transition-colors hover:bg-error-subtle hover:text-error"
          title="Delete from canvas"
        >
          <X size={12} />
        </button>
        <Handle type="source" position={Position.Right} className="!h-4 !w-4 !border-2 !border-border !bg-surface-raised" />
      </div>
    );
  }

  const status = processingOrFilled(isGenerating);

  const hasModel = connectedModelCount > 0;
  const canGenerate = !!strategy.name.trim() && !!strategy.hypothesis.trim() && hasModel;

  const hint = !isGenerating
    ? !hasModel
      ? 'Connect a Model node'
      : !strategy.name.trim() || !strategy.hypothesis.trim()
        ? 'Add a name and hypothesis'
        : null
    : null;

  return (
    <NodeShell
      nodeId={nodeId}
      nodeType="hypothesis"
      selected={!!selected}
      width="w-node"
      status={status}
      handleColor={canGenerate ? 'green' : 'amber'}
      targetShape="diamond"
      targetPulse={!hasModel}
    >
      <NodeHeader onRemove={handleDelete}>
        {editingName ? (
          <>
            <input
              autoFocus
              value={strategy.name}
              onChange={(e) => update('name', e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false);
              }}
              className={`${RF_INTERACTIVE} min-w-0 flex-1 rounded border border-accent bg-transparent px-1 text-xs font-semibold text-fg outline-none`}
            />
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={handleExportDebugMarkdown}
              className="nodrag shrink-0 rounded p-0.5 text-fg-faint transition-colors hover:text-fg-muted"
              title="Download hypothesis debug snapshot (Markdown)"
            >
              <FileText size={10} />
            </button>
          </>
        ) : (
          <div
            className="flex min-w-0 flex-1 items-center gap-1"
            onDoubleClick={() => setEditingName(true)}
          >
            <span className="truncate text-xs font-semibold text-fg">
              {strategy.name || 'Untitled'}
            </span>
            <button
              onClick={() => setEditingName(true)}
              className="nodrag shrink-0 rounded p-0.5 text-fg-faint transition-colors hover:text-fg-muted"
              title="Rename"
            >
              <Pencil size={10} />
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={handleExportDebugMarkdown}
              className="nodrag shrink-0 rounded p-0.5 text-fg-faint transition-colors hover:text-fg-muted"
              title="Download hypothesis debug snapshot (Markdown)"
            >
              <FileText size={10} />
            </button>
          </div>
        )}
      </NodeHeader>

      {hypoAutoGen.isGenerating ? (
        <div className={`${RF_INTERACTIVE} border-b border-border-subtle px-3 py-2`}>
          {hypoAutoGen.error ? <NodeErrorBlock variant="plain" message={hypoAutoGen.error} /> : null}
          <div className="flex items-center justify-center gap-2 rounded-md border border-border-subtle bg-surface-raised py-2 text-nano text-fg-muted">
            <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden />
            Generating hypothesis…
          </div>
        </div>
      ) : null}

      <div className="flex min-h-[var(--min-height-hypothesis-shell)] flex-col px-3 pb-2 pt-1">
        <div
          className={`${RF_INTERACTIVE} mb-1.5 flex gap-0.5 rounded-md border border-border bg-surface-raised p-0.5`}
          role="tablist"
          aria-label="Hypothesis fields"
        >
          {TAB_DEFS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={editorTab === id}
              onPointerDown={() => setEditorTab(id)}
              className={`${RF_INTERACTIVE} min-w-0 flex-1 rounded px-2 py-1 text-center text-nano font-medium transition-colors ${
                editorTab === id
                  ? 'bg-fg text-bg shadow-sm'
                  : 'text-fg-muted hover:bg-surface hover:text-fg-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1" role="tabpanel">
          {editorTab === 'hypothesis' && (
            <textarea
              value={strategy.hypothesis}
              onChange={(e) => update('hypothesis', e.target.value)}
              rows={8}
              placeholder="What you're exploring or validating with this hypothesis…"
              className={`${RF_INTERACTIVE} min-h-[var(--min-height-hypothesis-textarea)] w-full resize-y rounded border border-border px-2.5 py-2 text-micro leading-relaxed text-fg-secondary placeholder:text-fg-faint input-focus`}
            />
          )}
          {editorTab === 'why' && (
            <textarea
              value={strategy.rationale}
              onChange={(e) => update('rationale', e.target.value)}
              rows={8}
              placeholder="Rationale, tradeoffs, and why this hypothesis is worth testing..."
              className={`${RF_INTERACTIVE} min-h-[var(--min-height-hypothesis-textarea)] w-full resize-y rounded border border-border px-2.5 py-2 text-micro leading-relaxed text-fg-secondary placeholder:text-fg-faint input-focus`}
            />
          )}
          {editorTab === 'measurements' && (
            <textarea
              value={strategy.measurements}
              onChange={(e) => update('measurements', e.target.value)}
              rows={8}
              placeholder="Signals, metrics, or evaluation criteria..."
              className={`${RF_INTERACTIVE} min-h-[var(--min-height-hypothesis-textarea)] w-full resize-y rounded border border-border px-2.5 py-2 text-micro leading-relaxed text-fg-secondary placeholder:text-fg-faint input-focus`}
            />
          )}
        </div>
      </div>

      <div className="border-t border-border-subtle px-3 py-2.5">
        {generationError && <NodeErrorBlock message={generationError} />}

        <div className={`${RF_INTERACTIVE} mb-2 space-y-1.5`}>
          <div className="rounded-md border border-border-subtle bg-surface/40 px-2 py-1.5">

            <div className="flex items-center gap-1">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={revisionEnabled}
                  onChange={(e) => setRevisionEnabled(e.target.checked)}
                  className="accent-accent shrink-0"
                />
                <span className="text-nano font-medium text-fg-secondary">Auto-improve</span>
              </label>
              <DsHelpTooltip
                aria-label="What Auto-improve does"
                content={
                  <>
                    <span className="font-medium text-fg-secondary">Off:</span> one design pass, no quality loop.{' '}
                    <span className="font-medium text-fg-secondary">On:</span> score the work, then the agent can refine
                    it—bounded by max rounds and an optional score target below.
                  </>
                }
              />
            </div>
            {revisionEnabled ? (
              <div className="mt-2 space-y-2 pl-7">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-nano text-fg-muted" htmlFor={`${nodeId}-max-rounds`}>
                    Max rounds
                  </label>
                  <input
                    id={`${nodeId}-max-rounds`}
                    type="number"
                    min={EVALUATOR_MAX_REVISION_ROUNDS_MIN}
                    max={EVALUATOR_MAX_REVISION_ROUNDS_MAX}
                    value={displayMaxRounds}
                    onChange={(e) =>
                      setHypothesisGenerationSettings(nodeId, {
                        maxRevisionRounds: Number(e.target.value),
                      })
                    }
                    className="w-14 rounded border border-border bg-bg px-1.5 py-1 text-nano text-fg-secondary input-focus"
                  />
                </div>
                <div className="space-y-1">
                  <label className="flex cursor-pointer items-start gap-2 select-none">
                    <input
                      type="checkbox"
                      checked={targetScoreChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setHypothesisGenerationSettings(nodeId, {
                            minOverallScore: globalMinScore ?? 4,
                          });
                        } else {
                          setHypothesisGenerationSettings(nodeId, {
                            minOverallScore: null,
                          });
                        }
                      }}
                      className="accent-accent mt-0.5 shrink-0"
                    />
                    <span className="text-nano text-fg-secondary">
                      Target quality score (early stop when reached)
                    </span>
                  </label>
                  {targetScoreChecked ? (
                    <input
                      type="number"
                      min={EVALUATOR_MIN_SCORE}
                      max={EVALUATOR_MAX_SCORE}
                      step={0.1}
                      value={effectiveMinScore ?? EVALUATOR_MIN_SCORE}
                      onChange={(e) =>
                        setHypothesisGenerationSettings(nodeId, {
                          minOverallScore: Number(e.target.value),
                        })
                      }
                      className="ml-6 w-20 rounded border border-border bg-bg px-1.5 py-1 text-nano text-fg-secondary input-focus"
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className={RF_INTERACTIVE}>
          {hint && (
            <p className="mb-1.5 text-center text-nano text-fg-muted">{hint}</p>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !canGenerate}
            aria-busy={isGenerating}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-fg px-3 py-2 text-xs font-medium text-bg transition-colors hover:bg-fg-on-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 size={12} className="animate-spin" aria-hidden />
                {generationProgress && generationProgress.total > 1
                  ? generationProgress.completed === 0
                    ? `Designing ${smallNumberToWord(generationProgress.total)} previews…`
                    : `${generationProgress.completed} of ${generationProgress.total} ready…`
                  : 'Designing…'}
              </>
            ) : (
              <>
                <Zap size={12} className="shrink-0 opacity-90" aria-hidden />
                Design
              </>
            )}
          </button>
          {isGenerating ? (
            <p className="mt-1.5 text-center text-nano leading-snug text-fg-muted">
              Stopping ends the server request; partial output may remain on the card.
            </p>
          ) : null}
          {isGenerating ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleStopGeneration}
              className="mt-2 w-full rounded-md border border-error-border bg-error-subtle px-3 py-2 text-xs font-semibold text-error transition-colors hover:bg-error-surface-hover"
            >
              Stop generation
            </button>
          ) : null}
        </div>
      </div>
    </NodeShell>
  );
}

export default memo(HypothesisNode);
