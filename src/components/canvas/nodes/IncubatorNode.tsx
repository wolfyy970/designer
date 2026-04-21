import { memo, useCallback, useMemo, useState } from 'react';
import { useReactFlow, type NodeProps, type Node } from '@xyflow/react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { normalizeError } from '../../../lib/error-utils';
import { useSpecStore } from '../../../stores/spec-store';
import {
  useIncubatorStore,
  findStrategy,
} from '../../../stores/incubator-store';
import { useGenerationStore } from '../../../stores/generation-store';
import {
  useCanvasStore,
  INPUT_NODE_TYPES,
  type CanvasNodeType,
} from '../../../stores/canvas-store';
import type { IncubatorNodeData } from '../../../types/canvas-data';
import type { HypothesisStrategy } from '../../../types/incubator';
import { incubateStream } from '../../../api/client';
import { buildIncubateInputs } from '../../../lib/canvas-graph';
import { useWorkspaceDomainStore } from '../../../stores/workspace-domain-store';
import { scheduleCanvasFitView } from '../../../lib/canvas-fit-view';
import { processingOrFilled } from '../../../lib/node-status';
import { isPlaceholderHypothesis } from '../../../lib/hypothesis-node-utils';
import { EDGE_STATUS, RF_INTERACTIVE } from '../../../constants/canvas';
import { useConnectedModel } from '../../../hooks/useConnectedModel';
import { useCanvasNodePermanentRemove } from '../../../hooks/useCanvasNodePermanentRemove';
import { STATIC_NODE_DELETE_COPY } from '../../../lib/canvas-permanent-delete-copy';
import { useElapsedTimer } from '../../../hooks/useElapsedTimer';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';
import TaskStreamMonitor from './TaskStreamMonitor';
import { createTaskStreamSession } from '../../../hooks/task-stream-session';
import {
  createInitialTaskStreamState,
  type TaskStreamState,
} from '../../../hooks/task-stream-state';
import { NodeErrorBlock } from './shared/NodeErrorBlock';

const COUNT_OPTIONS = [1, 2, 3, 5];
const DEFAULT_COUNT = 3;

type IncubatorNodeFlowType = Node<IncubatorNodeData, 'incubator'>;

function IncubatorNode({ id, data, selected }: NodeProps<IncubatorNodeFlowType>) {
  const { fitView } = useReactFlow();
  const spec = useSpecStore((s) => s.spec);

  const isCompiling = useIncubatorStore((s) => s.isCompiling);
  const error = useIncubatorStore((s) => s.error);
  const appendStrategiesToNode = useIncubatorStore((s) => s.appendStrategiesToNode);
  const setCompiling = useIncubatorStore((s) => s.setCompiling);
  const setError = useIncubatorStore((s) => s.setError);

  const onRemove = useCanvasNodePermanentRemove(id, STATIC_NODE_DELETE_COPY.incubator);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const syncAfterIncubate = useCanvasStore((s) => s.syncAfterIncubate);
  const addPlaceholderHypotheses = useCanvasStore((s) => s.addPlaceholderHypotheses);
  const removePlaceholders = useCanvasStore((s) => s.removePlaceholders);
  const setEdgeStatusBySource = useCanvasStore((s) => s.setEdgeStatusBySource);
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const domainWiring = useWorkspaceDomainStore((s) => s.incubatorWirings[id]);

  const { providerId, modelId, supportsVision } = useConnectedModel(id);

  const hypothesisCount = (data.hypothesisCount as number | undefined) ?? DEFAULT_COUNT;
  const [taskStreamState, setTaskStreamState] = useState<TaskStreamState>(() =>
    createInitialTaskStreamState('idle'),
  );

  // Count connected input nodes (spec inputs + reference previews)
  const connectedInputCount = useMemo(() => {
    if (
      domainWiring &&
      (domainWiring.inputNodeIds.length > 0 || domainWiring.previewNodeIds.length > 0)
    ) {
      return (
        domainWiring.inputNodeIds.length +
        domainWiring.previewNodeIds.length
      );
    }
    const incomingEdges = edges.filter((e) => e.target === id);
    return incomingEdges.filter((e) => {
      const sourceNode = nodes.find((n) => n.id === e.source);
      return sourceNode && (
        INPUT_NODE_TYPES.has(sourceNode.type as CanvasNodeType) ||
        sourceNode.type === 'preview'
      );
    }).length;
  }, [domainWiring, edges, nodes, id]);

  /** Hypothesis cards on the canvas wired to this incubator (not stale rows in persisted dimension map). */
  const totalHypotheses = useMemo(() => {
    const outgoingTargets = edges.filter((e) => e.source === id).map((e) => e.target);
    const targetSet = new Set(outgoingTargets);
    return nodes.filter(
      (n) =>
        n.type === 'hypothesis' &&
        targetSet.has(n.id) &&
        !isPlaceholderHypothesis(n.data),
    ).length;
  }, [edges, nodes, id]);

  const handleCountChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { hypothesisCount: Number(e.target.value) });
    },
    [id, updateNodeData],
  );

  const handleIncubate = useCallback(async () => {
    if (useIncubatorStore.getState().isCompiling) return;

    const results = useGenerationStore.getState().results;
    const wiring = useWorkspaceDomainStore.getState().incubatorWirings[id];
    const { partialSpec, referenceDesigns } =
      await buildIncubateInputs(nodes, edges, spec, id, results, wiring);

    const incubationPlans = useIncubatorStore.getState().incubationPlans;
    const existingStrategies: HypothesisStrategy[] = [];
    const hypotheses = useWorkspaceDomainStore.getState().hypotheses;
    for (const h of Object.values(hypotheses)) {
      if (h.incubatorId !== id || h.placeholder) continue;
      const strategy = findStrategy(incubationPlans, h.strategyId);
      if (strategy) existingStrategies.push(strategy);
    }

    setCompiling(true);
    setTaskStreamState({ ...createInitialTaskStreamState(), status: 'streaming' });
    setError(null);
    setEdgeStatusBySource(id, EDGE_STATUS.PROCESSING);

    const placeholderIds = addPlaceholderHypotheses(id, hypothesisCount);

    let session: ReturnType<typeof createTaskStreamSession> | undefined;
    try {
      const taskSession = createTaskStreamSession({
        sessionId: `incubate-${id}-${Date.now()}`,
        correlationId: crypto.randomUUID(),
        onPatch: (patch) => setTaskStreamState((prev) => ({ ...prev, ...patch })),
      });
      session = taskSession;
      const map = await incubateStream(
        {
          spec: partialSpec,
          providerId: providerId!,
          modelId: modelId!,
          referenceDesigns,
          supportsVision,
          promptOptions: { count: hypothesisCount, existingStrategies },
        },
        { agentic: taskSession.callbacks },
      );
      removePlaceholders(placeholderIds);
      appendStrategiesToNode(id, map);
      syncAfterIncubate(map.hypotheses, id);
      setEdgeStatusBySource(id, EDGE_STATUS.COMPLETE);
      scheduleCanvasFitView(fitView);
    } catch (err) {
      removePlaceholders(placeholderIds);
      setError(normalizeError(err, 'Incubation failed'));
      setEdgeStatusBySource(id, EDGE_STATUS.ERROR);
    } finally {
      void session?.finalize();
      setTaskStreamState(createInitialTaskStreamState('idle'));
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
    appendStrategiesToNode,
    syncAfterIncubate,
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
      ? 'Connect input nodes to begin'
      : !modelId
        ? 'Connect a Model node'
        : null
    : null;

  return (
    <NodeShell
      nodeId={id}
      nodeType="incubator"
      selected={!!selected}
      width="w-node"
      status={status}
      handleColor={isReady ? 'green' : 'amber'}
      targetShape="diamond"
      targetPulse={!isReady}
    >
      <NodeHeader
        onRemove={onRemove}
        description="Synthesizes your inputs into differentiated hypothesis strategies to explore."
      >
        <h3 className="text-xs font-semibold text-fg">Incubator</h3>
      </NodeHeader>

      {/* Skeleton overlay while incubating */}
      {isCompiling && (
        <TaskStreamMonitor
          state={taskStreamState}
          elapsed={elapsed}
          fallbackLabel="Incubating…"
        />
      )}

      {/* Controls */}
      <div className="space-y-2 px-3 py-2.5">
        {error && !isCompiling && <NodeErrorBlock variant="plain" message={error} />}

        <div className={`${RF_INTERACTIVE} space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="text-nano text-fg-muted">
              {connectedInputCount} input{connectedInputCount !== 1 ? 's' : ''} connected
            </span>
          </div>
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
            <div className="flex justify-center">
              <span className="inline-flex items-center rounded-full border border-warning-border bg-warning-subtle px-2 py-0.5 font-mono text-nano text-warning">
                {hint}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleIncubate}
            disabled={isCompiling || !isReady}
            aria-busy={isCompiling}
            aria-label={isCompiling ? 'Incubating…' : 'Generate hypotheses'}
            title={isCompiling ? 'Incubating…' : undefined}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCompiling ? (
              <>
                <RefreshCw size={12} className="animate-spin" aria-hidden />
                Incubating…
              </>
            ) : (
              <>
                Generate
                <ArrowRight size={12} aria-hidden />
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

export default memo(IncubatorNode);
