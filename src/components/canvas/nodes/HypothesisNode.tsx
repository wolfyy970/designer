import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, type Node, Handle, Position } from '@xyflow/react';
import { FileText, Pencil, X } from 'lucide-react';
import { useIncubatorStore, findStrategy } from '../../../stores/incubator-store';
import { useCanvasStore } from '../../../stores/canvas-store';
import { countActiveGenerationSlots, useGenerationStore } from '../../../stores/generation-store';
import { useSpecStore } from '../../../stores/spec-store';
import { useWorkspaceDomainStore } from '../../../stores/workspace-domain-store';
import { useEvaluatorDefaultsStore } from '../../../stores/evaluator-defaults-store';
import type { HypothesisNodeData } from '../../../types/canvas-data';
import { useHypothesisGeneration } from '../../../hooks/useHypothesisGeneration';
import { useAppConfig } from '../../../hooks/useAppConfig';
import { useHypothesisAutoGenerate } from '../../../hooks/useHypothesisAutoGenerate';
import { consumePendingAutoGenerate } from '../../../lib/hypothesis-pending-generate';
import { useNodeRemoval } from '../../../hooks/useNodeRemoval';
import { useRequestPermanentDelete } from '../../../hooks/useRequestPermanentDelete';
import { hypothesisDeleteCopy } from '../../../lib/canvas-permanent-delete-copy';
import { processingOrFilled } from '../../../lib/node-status';
import { GENERATION_STATUS } from '../../../constants/generation';
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
import {
  decodeStrategyStreamingSnapshot,
  encodeStrategyStreamingSnapshot,
} from '../../../lib/strategy-streaming-snapshot';
import { HypothesisAutoImproveSettings } from './HypothesisAutoImproveSettings';
import { HypothesisGenerateButton } from './HypothesisGenerateButton';
import { useElapsedTimer } from '../../../hooks/useElapsedTimer';
import TaskStreamMonitor from './TaskStreamMonitor';

type HypothesisEditorTab = 'hypothesis' | 'why' | 'measurements';

const TAB_DEFS: { id: HypothesisEditorTab; label: string }[] = [
  { id: 'hypothesis', label: 'Hypothesis' },
  { id: 'why', label: 'Why' },
  { id: 'measurements', label: 'Measurements' },
];

type HypothesisNodeType = Node<HypothesisNodeData, 'hypothesis'>;

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

  const activeGenerationsCount = useGenerationStore((s) => countActiveGenerationSlots(s));
  const { data: appConfig } = useAppConfig();
  const maxConcurrentRuns = appConfig?.maxConcurrentRuns ?? 5;
  const serverAtCapacity =
    activeGenerationsCount >= maxConcurrentRuns && !isGenerating;

  /** Stable string: best streaming lane (max streamed chars) for multi-model runs. */
  const strategyStreamingKey = useGenerationStore((s) => {
    let bestChars = -1;
    let name: string | undefined;
    let path: string | undefined;
    let chars = 0;
    for (const r of s.results) {
      if (r.strategyId !== strategyId || r.status !== GENERATION_STATUS.GENERATING) continue;
      if (r.streamingToolName == null) continue;
      const c = r.streamingToolChars ?? 0;
      if (c > bestChars) {
        bestChars = c;
        name = r.streamingToolName;
        path = r.streamingToolPath;
        chars = c;
      }
    }
    return name != null ? encodeStrategyStreamingSnapshot(name, chars, path ?? '') : '';
  });

  const strategyStreamingSnap = useMemo(
    () => (strategyStreamingKey ? decodeStrategyStreamingSnapshot(strategyStreamingKey) : null),
    [strategyStreamingKey],
  );

  const { handleGenerate, generationProgress, generationError } =
    useHypothesisGeneration({ nodeId, strategyId });

  const hypoAutoGen = useHypothesisAutoGenerate({ nodeId, strategyId });
  const hypoAutoGenElapsed = useElapsedTimer(hypoAutoGen.isGenerating);

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
        : serverAtCapacity
          ? 'Server is at capacity—wait for a run to finish.'
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
          <TaskStreamMonitor
            state={hypoAutoGen.taskStreamState}
            elapsed={hypoAutoGenElapsed}
            fallbackLabel="Generating hypothesis…"
          />
        </div>
      ) : null}

      <div className="flex min-h-[var(--min-height-hypothesis-shell)] flex-col px-3 pb-2 pt-1">
        <div
          className={`${RF_INTERACTIVE} mb-1.5 flex gap-0.5 rounded-md border border-border bg-surface p-0.5`}
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
                  : 'text-fg-muted hover:text-fg-secondary'
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

        <HypothesisAutoImproveSettings
          nodeId={nodeId}
          revisionEnabled={revisionEnabled}
          onRevisionEnabledChange={setRevisionEnabled}
          displayMaxRounds={displayMaxRounds}
          onMaxRoundsChange={(value) =>
            setHypothesisGenerationSettings(nodeId, { maxRevisionRounds: value })
          }
          targetScoreChecked={targetScoreChecked}
          effectiveMinScore={effectiveMinScore}
          onTargetScoreToggle={(checked) => {
            if (checked) {
              setHypothesisGenerationSettings(nodeId, { minOverallScore: globalMinScore ?? 4 });
            } else {
              setHypothesisGenerationSettings(nodeId, { minOverallScore: null });
            }
          }}
          onMinScoreChange={(value) =>
            setHypothesisGenerationSettings(nodeId, { minOverallScore: value })
          }
        />

        <HypothesisGenerateButton
          hint={hint}
          isGenerating={isGenerating}
          canGenerate={canGenerate}
          serverAtCapacity={serverAtCapacity}
          activeGenerationsCount={activeGenerationsCount}
          maxConcurrentRuns={maxConcurrentRuns}
          onGenerate={handleGenerate}
          onStop={handleStopGeneration}
          generationProgress={generationProgress}
          streamingSnap={strategyStreamingSnap}
        />
      </div>
    </NodeShell>
  );
}

export default memo(HypothesisNode);
