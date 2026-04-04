import { memo, useCallback, useState } from 'react';
import { type NodeProps, type Node, Handle, Position } from '@xyflow/react';
import { ClipboardCopy, FileText, Loader2, Pencil, Sparkles, X, Zap } from 'lucide-react';
import { useCompilerStore, findVariantStrategy } from '../../../stores/compiler-store';
import { useCanvasStore } from '../../../stores/canvas-store';
import { useGenerationStore } from '../../../stores/generation-store';
import { useSpecStore } from '../../../stores/spec-store';
import { useWorkspaceDomainStore } from '../../../stores/workspace-domain-store';
import type { HypothesisNodeData } from '../../../types/canvas-data';
import { useHypothesisGeneration } from '../../../hooks/useHypothesisGeneration';
import { useNodeRemoval } from '../../../hooks/useNodeRemoval';
import { useRequestPermanentDelete } from '../../../hooks/useRequestPermanentDelete';
import { hypothesisDeleteCopy } from '../../../lib/canvas-permanent-delete-copy';
import { useElapsedTimer } from '../../../hooks/useElapsedTimer';
import { processingOrFilled } from '../../../lib/node-status';
import { GENERATION_STATUS } from '../../../constants/generation';
import { abortGenerationForStrategy } from '../../../lib/generation-abort-registry';
import { NODE_STATUS, NODE_TYPES } from '../../../constants/canvas';
import {
  countIncomingModelsWithModelSelected,
  countOutgoingNodesOfType,
} from '../../../workspace/graph-queries';
import {
  buildHypothesisDebugMarkdown,
  downloadTextFile,
  findDimensionMapForVariant,
} from '../../../lib/debug-markdown-export';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';
import GeneratingSkeleton from './GeneratingSkeleton';

type HypothesisEditorTab = 'hypothesis' | 'why' | 'measurements';

const TAB_DEFS: { id: HypothesisEditorTab; label: string }[] = [
  { id: 'hypothesis', label: 'Hypothesis' },
  { id: 'why', label: 'Why' },
  { id: 'measurements', label: 'Measurements' },
];

type HypothesisNodeType = Node<HypothesisNodeData, 'hypothesis'>;

function HypothesisNode({ id: nodeId, data, selected }: NodeProps<HypothesisNodeType>) {
  const strategyId = data.refId ?? '';

  const strategy = useCompilerStore(
    (s) => findVariantStrategy(s.dimensionMaps, strategyId),
  );
  const updateVariant = useCompilerStore((s) => s.updateVariant);

  const agentMode = useCanvasStore(
    (s) =>
      ((s.nodes.find((n) => n.id === nodeId)?.data.agentMode as 'single' | 'agentic' | undefined) ??
        'single'),
  );

  const setAgentMode = useCallback(
    (mode: 'single' | 'agentic') =>
      useCanvasStore.getState().updateNodeData(nodeId, { agentMode: mode }),
    [nodeId],
  );

  const handleRemove = useNodeRemoval(nodeId);
  const { requestPermanentDelete } = useRequestPermanentDelete();

  const connectedModelCount = useCanvasStore((s) =>
    countIncomingModelsWithModelSelected(nodeId, { nodes: s.nodes, edges: s.edges }),
  );

  // Check if THIS hypothesis is generating (not global)
  const isGenerating = useGenerationStore((s) =>
    s.results.some((r) => r.variantStrategyId === strategyId && r.status === GENERATION_STATUS.GENERATING),
  );

  const elapsed = useElapsedTimer(isGenerating);

  const { handleGenerate, generationProgress, generationError } =
    useHypothesisGeneration({ nodeId, strategyId });

  const handleStopGeneration = useCallback(() => {
    abortGenerationForStrategy(strategyId);
  }, [strategyId]);

  const [editorTab, setEditorTab] = useState<HypothesisEditorTab>('hypothesis');
  const [editingName, setEditingName] = useState(false);

  const update = useCallback(
    (field: string, value: string) => {
      updateVariant(strategyId, { [field]: value });
    },
    [strategyId, updateVariant],
  );

  const handleExportDebugMarkdown = useCallback(() => {
    if (!strategy) return;
    const spec = useSpecStore.getState().spec;
    const compiler = useCompilerStore.getState();
    const domain = useWorkspaceDomainStore.getState();
    const gen = useGenerationStore.getState();
    const dimensionMap = findDimensionMapForVariant(compiler.dimensionMaps, strategyId);
    const domainHypothesis = domain.hypotheses[nodeId];
    const compiledPromptsForStrategy = compiler.compiledPrompts.filter(
      (p) => p.variantStrategyId === strategyId,
    );
    const resultsForStrategy = gen.results.filter((r) => r.variantStrategyId === strategyId);
    const md = buildHypothesisDebugMarkdown({
      exportedAt: new Date().toISOString(),
      canvasTitle: spec.title,
      hypothesisNodeId: nodeId,
      strategy,
      dimensionMap,
      domainHypothesis,
      modelProfiles: domain.modelProfiles,
      designSystems: domain.designSystems,
      spec,
      compiledPromptsForStrategy,
      resultsForStrategy,
      agentModeOnNode: agentMode,
    });
    const slug = (strategy.name || 'hypothesis')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    downloadTextFile(`${slug}-hypothesis-debug-${stamp}.md`, md);
  }, [strategy, strategyId, nodeId, agentMode]);

  const handleDelete = useCallback(() => {
    const snap = useCanvasStore.getState();
    const variantCount = countOutgoingNodesOfType(nodeId, NODE_TYPES.VARIANT, snap);
    const { title, description, confirmLabel, cancelLabel } =
      hypothesisDeleteCopy(variantCount);
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

  // Convert small numbers to words for better UX
  const numberToWord = (n: number): string => {
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    return n <= 10 ? words[n] : n.toString();
  };

  // Layer 2: inline readiness hint
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
              className="nodrag nowheel min-w-0 flex-1 rounded border border-accent bg-transparent px-1 text-xs font-semibold text-fg outline-none"
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

      {/* Hypothesis / Why / Measurements — one tab at a time for readable editing */}
      <div className="flex min-h-[var(--min-height-hypothesis-shell)] flex-col px-3 pb-2 pt-1">
        <div
          className="nodrag nowheel mb-1.5 flex gap-0.5 rounded-md border border-border bg-surface-raised p-0.5"
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
              className={`nodrag nowheel min-w-0 flex-1 rounded px-2 py-1 text-center text-nano font-medium transition-colors ${
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
              placeholder="What you're exploring or validating with this variant..."
              className="nodrag nowheel min-h-[var(--min-height-hypothesis-textarea)] w-full resize-y rounded border border-border px-2.5 py-2 text-micro leading-relaxed text-fg-secondary placeholder:text-fg-faint input-focus"
            />
          )}
          {editorTab === 'why' && (
            <textarea
              value={strategy.rationale}
              onChange={(e) => update('rationale', e.target.value)}
              rows={8}
              placeholder="Rationale, tradeoffs, and why this hypothesis is worth testing..."
              className="nodrag nowheel min-h-[var(--min-height-hypothesis-textarea)] w-full resize-y rounded border border-border px-2.5 py-2 text-micro leading-relaxed text-fg-secondary placeholder:text-fg-faint input-focus"
            />
          )}
          {editorTab === 'measurements' && (
            <textarea
              value={strategy.measurements}
              onChange={(e) => update('measurements', e.target.value)}
              rows={8}
              placeholder="Signals, metrics, or evaluation criteria..."
              className="nodrag nowheel min-h-[var(--min-height-hypothesis-textarea)] w-full resize-y rounded border border-border px-2.5 py-2 text-micro leading-relaxed text-fg-secondary placeholder:text-fg-faint input-focus"
            />
          )}
        </div>
      </div>

      {/* Skeleton while generating */}
      {isGenerating && (
        <GeneratingSkeleton
          label={agentMode === 'agentic' ? 'Agent running…' : 'Generating…'}
          elapsed={elapsed}
        />
      )}

      {/* ── Generation Controls ──────────────────────────────── */}
      <div className="border-t border-border-subtle px-3 py-2.5">
        {generationError && (
          <div className="mb-2 rounded bg-error-subtle px-2 py-1.5 text-nano text-error select-text">
            <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words font-sans leading-snug text-inherit [font-size:inherit]">
              {generationError}
            </pre>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void navigator.clipboard?.writeText(generationError)}
              className="nodrag nowheel mt-1 flex items-center gap-1 rounded px-0.5 py-0.5 text-nano font-medium text-error hover:bg-error-surface hover:text-error"
            >
              <ClipboardCopy size={10} className="shrink-0 opacity-90" aria-hidden />
              Copy message
            </button>
          </div>
        )}

        <div className="nodrag nowheel mb-2 space-y-1.5">
          <div className="space-y-1">
            <span className="text-nano text-fg-muted">Run mode</span>
            <div className="flex gap-0.5 rounded border border-border bg-surface p-0.5">
              <button
                type="button"
                onPointerDown={() => setAgentMode('single')}
                title="Direct: one shot"
                className={`nodrag nowheel flex min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 py-0.5 text-nano transition-colors ${
                  agentMode === 'single' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg-secondary'
                }`}
              >
                <Sparkles size={9} className="shrink-0 opacity-90" />
                Direct
              </button>
              <button
                type="button"
                onPointerDown={() => setAgentMode('agentic')}
                title="Agentic: tools, eval, revise"
                className={`nodrag nowheel flex min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 py-0.5 text-nano transition-colors ${
                  agentMode === 'agentic' ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg-secondary'
                }`}
              >
                <Zap size={9} className="shrink-0 opacity-90" />
                Agentic
              </button>
            </div>
          </div>
          <p className="text-nano leading-snug text-fg-muted">
            <span className="font-medium text-fg-secondary">Thinking</span> is set on each{' '}
            <span className="text-fg-secondary">Model</span> node.
          </p>
        </div>

        <div className="nodrag nowheel">
          {hint && (
            <p className="mb-1.5 text-center text-nano text-fg-muted">{hint}</p>
          )}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !canGenerate}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-fg px-3 py-2 text-xs font-medium text-bg transition-colors hover:bg-fg-on-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                {generationProgress
                  ? generationProgress.completed === 0 && generationProgress.total > 1
                    ? `Generating ${numberToWord(generationProgress.total)} variants…`
                    : generationProgress.total > 1
                      ? `${generationProgress.completed} of ${generationProgress.total} ready…`
                      : agentMode === 'agentic'
                        ? 'Running agent…'
                        : 'Generating…'
                  : agentMode === 'agentic'
                    ? 'Running agent…'
                    : 'Generating…'}
              </>
            ) : (
              <>
                {agentMode === 'agentic' ? <Zap size={12} /> : <Sparkles size={12} />}
                {agentMode === 'agentic' ? 'Run agent' : 'Generate'}
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
