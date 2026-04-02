import { memo, useCallback, useMemo } from 'react';
import { useReactFlow, type NodeProps, type Node } from '@xyflow/react';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { normalizeError } from '../../../lib/error-utils';
import { useSpecStore } from '../../../stores/spec-store';
import {
  useCompilerStore,
  findVariantStrategy,
} from '../../../stores/compiler-store';
import { useGenerationStore } from '../../../stores/generation-store';
import {
  useCanvasStore,
  SECTION_NODE_TYPES,
  type CanvasNodeType,
} from '../../../stores/canvas-store';
import type { CompilerNodeData } from '../../../types/canvas-data';
import type { VariantStrategy } from '../../../types/compiler';
import { compile as apiCompile } from '../../../api/client';
import { buildCompileInputs } from '../../../lib/canvas-graph';
import { useWorkspaceDomainStore } from '../../../stores/workspace-domain-store';
import { FIT_VIEW_DELAY_MS, FIT_VIEW_DURATION_MS } from '../../../lib/constants';
import { processingOrFilled } from '../../../lib/node-status';
import { EDGE_STATUS } from '../../../constants/canvas';
import { useConnectedModel } from '../../../hooks/useConnectedModel';
import { useNodeRemoval } from '../../../hooks/useNodeRemoval';
import { useElapsedTimer } from '../../../hooks/useElapsedTimer';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';
import GeneratingSkeleton from './GeneratingSkeleton';

const COUNT_OPTIONS = [1, 2, 3, 5];
const DEFAULT_COUNT = 3;

type CompilerNodeType = Node<CompilerNodeData, 'compiler'>;

function CompilerNode({ id, data, selected }: NodeProps<CompilerNodeType>) {
  const { fitView } = useReactFlow();
  const spec = useSpecStore((s) => s.spec);

  const isCompiling = useCompilerStore((s) => s.isCompiling);
  const error = useCompilerStore((s) => s.error);
  const dimensionMap = useCompilerStore((s) => s.dimensionMaps[id]);
  const appendVariantsToNode = useCompilerStore((s) => s.appendVariantsToNode);
  const setCompiling = useCompilerStore((s) => s.setCompiling);
  const setError = useCompilerStore((s) => s.setError);

  const onRemove = useNodeRemoval(id);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const syncAfterCompile = useCanvasStore((s) => s.syncAfterCompile);
  const addPlaceholderHypotheses = useCanvasStore((s) => s.addPlaceholderHypotheses);
  const removePlaceholders = useCanvasStore((s) => s.removePlaceholders);
  const setEdgeStatusBySource = useCanvasStore((s) => s.setEdgeStatusBySource);
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const domainWiring = useWorkspaceDomainStore((s) => s.incubatorWirings[id]);

  const { providerId, modelId, supportsVision } = useConnectedModel(id);

  const hypothesisCount = (data.hypothesisCount as number | undefined) ?? DEFAULT_COUNT;

  // Count connected input nodes (sections + variants + critiques)
  const connectedInputCount = useMemo(() => {
    if (
      domainWiring &&
      (domainWiring.sectionNodeIds.length > 0 ||
        domainWiring.variantNodeIds.length > 0 ||
        domainWiring.critiqueNodeIds.length > 0)
    ) {
      return (
        domainWiring.sectionNodeIds.length +
        domainWiring.variantNodeIds.length +
        domainWiring.critiqueNodeIds.length
      );
    }
    const incomingEdges = edges.filter((e) => e.target === id);
    return incomingEdges.filter((e) => {
      const sourceNode = nodes.find((n) => n.id === e.source);
      return sourceNode && (
        SECTION_NODE_TYPES.has(sourceNode.type as CanvasNodeType) ||
        sourceNode.type === 'variant' ||
        sourceNode.type === 'critique'
      );
    }).length;
  }, [domainWiring, edges, nodes, id]);

  // Total hypothesis count from dimension map
  const totalHypotheses = dimensionMap?.variants.length ?? 0;

  const handleCountChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { hypothesisCount: Number(e.target.value) });
    },
    [id, updateNodeData],
  );

  const handleCompile = useCallback(async () => {
    const results = useGenerationStore.getState().results;
    const wiring = useWorkspaceDomainStore.getState().incubatorWirings[id];
    const { partialSpec, referenceDesigns, critiques } =
      await buildCompileInputs(nodes, edges, spec, id, results, wiring);

    const dimensionMaps = useCompilerStore.getState().dimensionMaps;
    const existingStrategies: VariantStrategy[] = [];
    const hypotheses = useWorkspaceDomainStore.getState().hypotheses;
    for (const h of Object.values(hypotheses)) {
      if (h.incubatorId !== id || h.placeholder) continue;
      const strategy = findVariantStrategy(dimensionMaps, h.variantStrategyId);
      if (strategy) existingStrategies.push(strategy);
    }

    setCompiling(true);
    setError(null);
    setEdgeStatusBySource(id, EDGE_STATUS.PROCESSING);

    const placeholderIds = addPlaceholderHypotheses(id, hypothesisCount);

    try {
      const map = await apiCompile({
        spec: partialSpec,
        providerId: providerId!,
        modelId: modelId!,
        referenceDesigns,
        critiques: critiques.length > 0 ? critiques : undefined,
        supportsVision,
        promptOptions: { count: hypothesisCount, existingStrategies },
      });
      removePlaceholders(placeholderIds);
      appendVariantsToNode(id, map);
      syncAfterCompile(map.variants, id);
      setEdgeStatusBySource(id, EDGE_STATUS.COMPLETE);
      setTimeout(() => fitView({ duration: FIT_VIEW_DURATION_MS, padding: 0.15 }), FIT_VIEW_DELAY_MS);
    } catch (err) {
      removePlaceholders(placeholderIds);
      setError(normalizeError(err, 'Compilation failed'));
      setEdgeStatusBySource(id, EDGE_STATUS.ERROR);
    } finally {
      setCompiling(false);
    }
  }, [
    spec,
    edges,
    nodes,
    id,
    modelId,
    providerId,
    supportsVision,
    hypothesisCount,
    setCompiling,
    setError,
    appendVariantsToNode,
    syncAfterCompile,
    addPlaceholderHypotheses,
    removePlaceholders,
    setEdgeStatusBySource,
    fitView,
  ]);

  const elapsed = useElapsedTimer(isCompiling);

  const status = processingOrFilled(isCompiling);

  const isReady = connectedInputCount > 0 && !!modelId;

  // Layer 2: inline readiness hint
  const hint = !isCompiling
    ? connectedInputCount === 0
      ? 'Connect section nodes to begin'
      : !modelId
        ? 'Connect a Model node'
        : null
    : null;

  return (
    <NodeShell
      nodeId={id}
      nodeType="compiler"
      selected={!!selected}
      width="w-node"
      status={status}
      handleColor={isReady ? 'green' : 'amber'}
      targetShape="diamond"
      targetPulse={!isReady}
    >
      <NodeHeader
        onRemove={onRemove}
        description={`${connectedInputCount} input${connectedInputCount !== 1 ? 's' : ''} connected`}
      >
        <h3 className="text-xs font-semibold text-fg">Incubator</h3>
      </NodeHeader>

      {/* Skeleton overlay while compiling */}
      {isCompiling && <GeneratingSkeleton label="Incubating…" elapsed={elapsed} />}

      {/* Controls */}
      <div className="space-y-2 px-3 py-2.5">
        {error && !isCompiling && (
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded bg-error-subtle px-2 py-1.5 text-nano text-error select-text">
            {error}
          </div>
        )}

        <div className="nodrag nowheel space-y-2">
          {/* Hypothesis count selector */}
          <div className="flex items-center justify-between">
            <label className="text-nano text-fg-secondary">New hypotheses</label>
            <select
              value={hypothesisCount}
              onChange={handleCountChange}
              disabled={isCompiling}
              className="rounded border border-border bg-surface px-1.5 py-0.5 text-nano text-fg"
            >
              {COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {hint && (
            <p className="text-center text-nano text-fg-muted">{hint}</p>
          )}

          <button
            onClick={handleCompile}
            disabled={isCompiling || !isReady}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-fg px-3 py-2 text-xs font-medium text-bg transition-colors hover:bg-fg/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCompiling ? (
              <>
                <RefreshCw size={12} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                Generate
                <ArrowRight size={12} />
              </>
            )}
          </button>
        </div>

        {totalHypotheses > 0 && !isCompiling && (
          <p className="text-nano text-fg-secondary">
            {totalHypotheses} {totalHypotheses === 1 ? 'hypothesis' : 'hypotheses'} total
          </p>
        )}
      </div>
    </NodeShell>
  );
}

export default memo(CompilerNode);
