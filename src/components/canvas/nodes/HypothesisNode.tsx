import { memo, useCallback, useState } from 'react';
import { type NodeProps, type Node, Handle, Position } from '@xyflow/react';
import { ChevronDown, ChevronRight, X, Sparkles, Loader2, Pencil, Zap } from 'lucide-react';
import { useCompilerStore, findVariantStrategy } from '../../../stores/compiler-store';
import { useCanvasStore } from '../../../stores/canvas-store';
import { useGenerationStore } from '../../../stores/generation-store';
import type { HypothesisNodeData } from '../../../types/canvas-data';
import { useHypothesisGeneration } from '../../../hooks/useHypothesisGeneration';
import { useNodeRemoval } from '../../../hooks/useNodeRemoval';
import { useElapsedTimer } from '../../../hooks/useElapsedTimer';
import { processingOrFilled } from '../../../lib/node-status';
import { GENERATION_STATUS } from '../../../constants/generation';
import { NODE_STATUS } from '../../../constants/canvas';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';
import GeneratingSkeleton from './GeneratingSkeleton';
import CompactField from './CompactField';

type HypothesisNodeType = Node<HypothesisNodeData, 'hypothesis'>;

function HypothesisNode({ id: nodeId, data, selected }: NodeProps<HypothesisNodeType>) {
  const strategyId = data.refId ?? '';

  const strategy = useCompilerStore(
    (s) => findVariantStrategy(s.dimensionMaps, strategyId),
  );
  const updateVariant = useCompilerStore((s) => s.updateVariant);
  // Read via Zustand store selectors (same pattern as useNodeProviderModel) so updates
  // from updateNodeData are immediately reactive — not delayed by React Flow reconciliation.
  const agentMode = useCanvasStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.agentMode as 'single' | 'agentic' | undefined) ?? 'single'),
  );
  const thinkingLevel = useCanvasStore(
    (s) => ((s.nodes.find((n) => n.id === nodeId)?.data.thinkingLevel as 'off' | 'minimal' | 'low' | 'medium' | 'high' | undefined) ?? 'minimal'),
  );

  const setAgentMode = useCallback(
    (mode: 'single' | 'agentic') => useCanvasStore.getState().updateNodeData(nodeId, { agentMode: mode }),
    [nodeId],
  );
  const setThinkingLevel = useCallback(
    (level: 'off' | 'minimal' | 'medium') => useCanvasStore.getState().updateNodeData(nodeId, { thinkingLevel: level }),
    [nodeId],
  );

  const handleRemove = useNodeRemoval(nodeId);

  // Count connected Model nodes with a selected model (reactive for UI)
  const connectedModelCount = useCanvasStore((s) => {
    let count = 0;
    for (const e of s.edges) {
      if (e.target !== nodeId) continue;
      const src = s.nodes.find((n) => n.id === e.source);
      if (src?.type === 'model' && src.data.modelId) count++;
    }
    return count;
  });

  // Check if THIS hypothesis is generating (not global)
  const isGenerating = useGenerationStore((s) =>
    s.results.some((r) => r.variantStrategyId === strategyId && r.status === GENERATION_STATUS.GENERATING),
  );

  const elapsed = useElapsedTimer(isGenerating);

  const { handleGenerate, generationProgress, generationError } =
    useHypothesisGeneration({ nodeId, strategyId });

  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);

  const update = useCallback(
    (field: string, value: string) => {
      updateVariant(strategyId, { [field]: value });
    },
    [strategyId, updateVariant],
  );

  const handleDelete = useCallback(() => {
    const { edges: storeEdges, nodes: storeNodes } = useCanvasStore.getState();
    let variantCount = 0;
    for (const e of storeEdges) {
      if (e.source !== nodeId) continue;
      if (storeNodes.find((n) => n.id === e.target && n.type === 'variant')) {
        variantCount++;
      }
    }
    if (variantCount > 0) {
      if (!window.confirm(`Delete this hypothesis and ${variantCount} connected ${variantCount === 1 ? 'variant' : 'variants'}?`)) return;
    }
    handleRemove();
  }, [handleRemove, nodeId]);

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
          title="Remove"
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
          </div>
        )}
      </NodeHeader>

      {/* Hypothesis */}
      <div className="px-3 py-2">
        <label className="mb-0.5 block text-nano font-medium text-fg-muted">
          Hypothesis
        </label>
        <textarea
          value={strategy.hypothesis}
          onChange={(e) => update('hypothesis', e.target.value)}
          rows={2}
          className="nodrag nowheel w-full resize-none rounded border border-border px-2 py-1.5 text-micro text-fg-secondary input-focus"
        />
      </div>

      {/* Expandable details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-nano text-fg-muted hover:text-fg-secondary"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="space-y-2 px-3 pb-3">
          <CompactField
            label="Why"
            value={strategy.rationale}
            onChange={(v) => update('rationale', v)}
            rows={2}
          />
          <CompactField
            label="Measurements"
            value={strategy.measurements}
            onChange={(v) => update('measurements', v)}
            rows={2}
          />
        </div>
      )}

      {/* Skeleton while generating */}
      {isGenerating && <GeneratingSkeleton label={agentMode === 'agentic' ? 'Agent reasoning…' : 'Creating design…'} elapsed={elapsed} />}

      {/* ── Generation Controls ──────────────────────────────── */}
      <div className="border-t border-border-subtle px-3 py-2.5">
        {generationError && (
          <div className="mb-2 rounded bg-error-subtle px-2 py-1.5 text-nano text-error">
            {generationError}
          </div>
        )}

        {/* Agentic mode toggle */}
        <div className="nodrag nowheel mb-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-nano text-fg-muted">
              <Zap size={9} />
              Agentic
            </span>
            <button
              onPointerDown={() => setAgentMode(agentMode === 'agentic' ? 'single' : 'agentic')}
              title={agentMode === 'agentic' ? 'Switch to single-shot mode' : 'Switch to agentic mode (uses more tokens)'}
              className={`relative h-4 w-7 overflow-hidden rounded-full transition-colors ${agentMode === 'agentic' ? 'bg-accent' : 'bg-border'}`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${agentMode === 'agentic' ? 'translate-x-3.5' : 'translate-x-0.5'}`}
              />
            </button>
          </div>

          {agentMode === 'agentic' && (
            <div className="flex items-center justify-between">
              <span className="text-nano text-fg-muted">Thinking</span>
              <div className="flex gap-0.5 rounded border border-border bg-surface p-0.5">
                {(['off', 'minimal', 'medium'] as const).map((level) => {
                  const label = level === 'off' ? 'None' : level === 'minimal' ? 'Light' : 'Deep';
                  return (
                    <button
                      key={level}
                      onPointerDown={() => setThinkingLevel(level)}
                      className={`rounded px-1.5 py-0.5 text-nano transition-colors ${thinkingLevel === level ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg-secondary'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="nodrag nowheel">
          {hint && (
            <p className="mb-1.5 text-center text-nano text-fg-muted">{hint}</p>
          )}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !canGenerate}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-fg px-3 py-2 text-xs font-medium text-bg transition-colors hover:bg-fg/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                {generationProgress
                  ? generationProgress.completed === 0 && generationProgress.total > 1
                    ? `Creating ${numberToWord(generationProgress.total)} designs...`
                    : generationProgress.total > 1
                      ? `${generationProgress.completed} of ${generationProgress.total} ready...`
                      : 'Creating...'
                  : 'Creating...'}
              </>
            ) : (
              <>
                {agentMode === 'agentic' ? <Zap size={12} /> : <Sparkles size={12} />}
                {agentMode === 'agentic' ? 'Think & Create' : 'Create'}
              </>
            )}
          </button>
        </div>
      </div>
    </NodeShell>
  );
}

export default memo(HypothesisNode);
