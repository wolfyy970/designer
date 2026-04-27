import { memo, useCallback, useMemo, useState } from 'react';
import { useReactFlow, type NodeProps, type Node } from '@xyflow/react';
import { ArrowRight, Eye, Plus, RefreshCw } from 'lucide-react';
import { normalizeError } from '../../../lib/error-utils';
import { Button } from '@ds/components/ui/button';
import { Badge } from '@ds/components/ui/badge';
import { DocumentViewer } from '@ds/components/ui/document-viewer';
import { StatusPanel, type StatusPanelTone } from '@ds/components/ui/status-panel';
import { useSpecStore } from '../../../stores/spec-store';
import {
  useIncubatorStore,
  findStrategy,
} from '../../../stores/incubator-store';
import { useGenerationStore } from '../../../stores/generation-store';
import { useCanvasStore } from '../../../stores/canvas-store';
import { countConnectedIncubatorInputs } from '../../../lib/incubator-input-count';
import type { IncubatorNodeData } from '../../../types/canvas-data';
import type { WorkspaceNode } from '../../../types/workspace-graph';
import type { HypothesisStrategy } from '../../../types/incubator';
import { incubateStream } from '../../../api/client';
import { buildIncubateInputs } from '../../../lib/canvas-graph';
import { getDesignSystemNodeData } from '../../../lib/canvas-node-data';
import {
  designMdSourceHasInput,
  designSystemSourceFromNodeData,
  type DesignMdStatus,
  getDesignMdStatus,
  isDesignMdDocumentStale,
} from '../../../lib/design-md';
import {
  isInternalContextDocumentStale,
} from '../../../lib/internal-context';
import { useWorkspaceDomainStore } from '../../../stores/workspace-domain-store';
import { scheduleCanvasFitView } from '../../../lib/canvas-fit-view';
import { processingOrFilled } from '../../../lib/node-status';
import { isPlaceholderHypothesis } from '../../../lib/hypothesis-node-utils';
import { EDGE_STATUS, NODE_TYPES, RF_INTERACTIVE } from '../../../constants/canvas';
import { useConnectedModel } from '../../../hooks/useConnectedModel';
import { useElapsedTimer } from '../../../hooks/useElapsedTimer';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';
import TaskStreamMonitor from './TaskStreamMonitor';
import Modal from '../../shared/Modal';
import { createTaskStreamSession } from '../../../hooks/task-stream-session';
import {
  createInitialTaskStreamState,
  type TaskStreamState,
} from '../../../hooks/task-stream-state';
import { NodeErrorBlock } from './shared/NodeErrorBlock';
import { useThinkingDefaultsStore } from '../../../stores/thinking-defaults-store';
import {
  needsInternalContextRefresh,
  useIncubatorDocumentPreparation,
} from '../../../hooks/useIncubatorDocumentPreparation';

const COUNT_OPTIONS = [1, 2, 3, 5];
const DEFAULT_COUNT = 3;

type IncubatorNodeFlowType = Node<IncubatorNodeData, 'incubator'>;

function designMdStatusLabel(status: DesignMdStatus): string {
  if (status === 'missing') return 'needs generation';
  if (status === 'generating') return 'generating...';
  return status;
}

function documentStatusLabel(status: string): string | undefined {
  if (status === 'ready') return undefined;
  if (status === 'generating') return 'generating...';
  return status;
}

function designMdStatusTone(status: DesignMdStatus): StatusPanelTone {
  if (status === 'ready') return 'success';
  if (status === 'error') return 'error';
  if (status === 'generating') return 'accent';
  return 'warning';
}

function IncubatorNode({ id, data, selected }: NodeProps<IncubatorNodeFlowType>) {
  const { fitView } = useReactFlow();
  const spec = useSpecStore((s) => s.spec);
  const hasDesignBrief = useSpecStore((s) =>
    Boolean(s.spec.sections['design-brief']?.content?.trim()),
  );

  const isCompiling = useIncubatorStore((s) => s.isCompiling);
  const error = useIncubatorStore((s) => s.error);
  const appendStrategiesToNode = useIncubatorStore((s) => s.appendStrategiesToNode);
  const setCompiling = useIncubatorStore((s) => s.setCompiling);
  const setError = useIncubatorStore((s) => s.setError);

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
  const [contextGenerating, setContextGenerating] = useState(false);
  const [contextModalOpen, setContextModalOpen] = useState(false);
  const [designMdGeneratingNodeId, setDesignMdGeneratingNodeId] = useState<string | null>(null);
  const [designMdModalNodeId, setDesignMdModalNodeId] = useState<string | null>(null);
  const internalContextDoc = spec.internalContextDocument;
  const internalContextStale = isInternalContextDocumentStale(spec, internalContextDoc);
  const internalContextStatus = contextGenerating
    ? 'generating'
    : internalContextDoc?.error
      ? 'error'
      : !internalContextDoc
        ? 'missing'
        : internalContextStale
          ? 'stale'
          : 'ready';
  const internalContextStatusLabel = documentStatusLabel(internalContextStatus);
  const internalContextStatusTone: StatusPanelTone =
    internalContextStatus === 'ready'
      ? 'success'
      : internalContextStatus === 'stale' || internalContextStatus === 'missing'
        ? 'warning'
        : internalContextStatus === 'error'
          ? 'error'
          : 'accent';

  const scopedDesignSystemNodes = useMemo((): WorkspaceNode[] => {
    const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
    const ids = domainWiring?.designSystemNodeIds ?? [];
    if (ids.length > 0) {
      return ids
        .map((nodeId) => nodeById.get(nodeId))
        .filter((n): n is WorkspaceNode => Boolean(n) && n!.type === NODE_TYPES.DESIGN_SYSTEM);
    }
    return edges
      .filter((e) => e.target === id)
      .map((e) => nodeById.get(e.source))
      .filter((n): n is WorkspaceNode => Boolean(n) && n!.type === NODE_TYPES.DESIGN_SYSTEM);
  }, [domainWiring, edges, nodes, id]);

  /**
   * Count what will actually feed into `buildIncubateInputs` — stale domain
   * wiring ids are filtered out so the card matches what the incubator sees.
   */
  const connectedInputCount = useMemo(
    () => countConnectedIncubatorInputs(nodes, edges, id, domainWiring),
    [domainWiring, edges, nodes, id],
  );

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

  const handleAddBlank = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (isCompiling || !hasDesignBrief || !modelId) return;
      useCanvasStore.getState().addNode(NODE_TYPES.HYPOTHESIS);
    },
    [hasDesignBrief, isCompiling, modelId],
  );

  const {
    refreshInternalContext,
    refreshDesignMdDocument,
    ensureDesignSystemDocuments,
  } = useIncubatorDocumentPreparation({
    incubatorId: id,
    providerId,
    modelId,
    setTaskStreamState,
    setContextGenerating,
    setDesignMdGeneratingNodeId,
  });

  const handleRefreshInternalContext = useCallback(() => {
    void refreshInternalContext().catch((err) => {
      setError(normalizeError(err, 'Internal context generation failed'));
    });
  }, [refreshInternalContext, setError]);

  const handleRefreshDesignMdDocument = useCallback((nodeId: string) => {
    void refreshDesignMdDocument(nodeId).catch((err) => {
      setError(normalizeError(err, 'DESIGN.md generation failed'));
    });
  }, [refreshDesignMdDocument, setError]);

  const handleIncubate = useCallback(async () => {
    if (useIncubatorStore.getState().isCompiling || contextGenerating || designMdGeneratingNodeId) return;

    const results = useGenerationStore.getState().results;
    const wiring = useWorkspaceDomainStore.getState().incubatorWirings[id];

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
      let internalContextDocument = useSpecStore.getState().spec.internalContextDocument?.content ?? '';
      if (needsInternalContextRefresh()) {
        internalContextDocument = await refreshInternalContext();
      }
      const designSystemDocumentsForPrompt = await ensureDesignSystemDocuments();

      const freshSpec = useSpecStore.getState().spec;
      const { partialSpec, referenceDesigns } =
        await buildIncubateInputs(nodes, edges, freshSpec, id, results, wiring);

      const taskSession = createTaskStreamSession({
        sessionId: `incubate-${id}-${Date.now()}`,
        correlationId: crypto.randomUUID(),
        onPatch: (patch) => setTaskStreamState((prev) => ({ ...prev, ...patch })),
      });
      session = taskSession;
      const thinkingOverride = useThinkingDefaultsStore.getState().overrides.incubate;
      const map = await incubateStream(
        {
          spec: partialSpec,
          providerId: providerId!,
          modelId: modelId!,
          referenceDesigns,
          supportsVision,
          internalContextDocument,
          designSystemDocuments: designSystemDocumentsForPrompt,
          promptOptions: { count: hypothesisCount, existingStrategies },
          thinking: thinkingOverride,
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
    contextGenerating,
    designMdGeneratingNodeId,
    refreshInternalContext,
    ensureDesignSystemDocuments,
  ]);

  const elapsed = useElapsedTimer(isCompiling || contextGenerating || Boolean(designMdGeneratingNodeId));

  const status = processingOrFilled(isCompiling || contextGenerating || Boolean(designMdGeneratingNodeId));

  const isReady = hasDesignBrief && !!modelId;

  /** Lowercase copy to match input-node “needs input” pill convention. */
  const readinessBlockReason = !modelId
    ? 'connect a model node'
    : !hasDesignBrief
      ? 'add a design brief first'
      : undefined;

  // Layer 2: inline readiness hint
  const hint = !isCompiling && !contextGenerating && !designMdGeneratingNodeId ? readinessBlockReason ?? null : null;
  const activeDesignMdModalNode = designMdModalNodeId
    ? scopedDesignSystemNodes.find((node) => node.id === designMdModalNodeId)
    : undefined;
  const activeDesignMdModalData = activeDesignMdModalNode
    ? getDesignSystemNodeData(activeDesignMdModalNode)
    : undefined;
  const canRunDocumentTask = Boolean(providerId && modelId);
  const internalContextCanView = Boolean(internalContextDoc?.content?.trim());
  const internalContextCanRefresh =
    canRunDocumentTask &&
    (internalContextStatus === 'stale' ||
      internalContextStatus === 'error' ||
      internalContextStatus === 'generating');

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
        description="Synthesizes your inputs into differentiated hypothesis strategies to explore."
      >
        <h3 className="text-xs font-semibold text-fg">Incubator</h3>
      </NodeHeader>

      {/* Skeleton overlay while incubating or refreshing generated documents */}
      {(isCompiling || contextGenerating || designMdGeneratingNodeId) && (
        <TaskStreamMonitor
          state={taskStreamState}
          elapsed={elapsed}
          fallbackLabel={
            designMdGeneratingNodeId
              ? 'Generating DESIGN.md…'
              : contextGenerating
                ? 'Synthesizing context…'
                : 'Incubating…'
          }
        />
      )}

      {/* Controls */}
      <div className="space-y-2 px-3 py-2.5">
        {error && !isCompiling && <NodeErrorBlock variant="plain" message={error} />}

        <div className={`${RF_INTERACTIVE} space-y-2`}>
          <div className="space-y-1.5">
            <StatusPanel
              title="Design specification"
              status={internalContextStatusLabel}
              tone={internalContextStatusTone}
              animated={internalContextStatus === 'generating'}
              density="compact"
              actions={internalContextCanView || internalContextCanRefresh ? (
                <>
                  {internalContextCanView ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="iconSm"
                      aria-label="View design specification"
                      title="View design specification"
                      onClick={() => setContextModalOpen(true)}
                    >
                      <Eye size={11} aria-hidden />
                    </Button>
                  ) : null}
                  {internalContextCanRefresh ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="iconSm"
                      disabled={isCompiling || contextGenerating}
                      aria-label="Refresh design specification"
                      title="Refresh design specification"
                      onClick={handleRefreshInternalContext}
                    >
                      <RefreshCw size={11} aria-hidden />
                    </Button>
                  ) : null}
                </>
              ) : undefined}
            >
              {internalContextDoc?.error && !contextGenerating ? (
                <span className="text-error">{internalContextDoc.error}</span>
              ) : null}
            </StatusPanel>

            {scopedDesignSystemNodes.length === 0 ? (
              <StatusPanel
                title="DESIGN.md"
                status="optional"
                tone="neutral"
                density="compact"
              />
            ) : scopedDesignSystemNodes.map((node) => {
              const ds = getDesignSystemNodeData(node);
              const source = ds ? designSystemSourceFromNodeData(ds) : {};
              const doc = ds?.designMdDocument;
              const hasSourceInput = designMdSourceHasInput(source);
              const dsStatus = getDesignMdStatus(source, designMdGeneratingNodeId === node.id, doc);
              const optional = !hasSourceInput && !doc?.content && dsStatus !== 'generating' && dsStatus !== 'error';
              const docHasContent = Boolean(doc?.content?.trim());
              const canRefreshDesignMd =
                canRunDocumentTask &&
                !optional &&
                hasSourceInput &&
                (dsStatus === 'missing' ||
                  dsStatus === 'stale' ||
                  dsStatus === 'error' ||
                  dsStatus === 'generating');
              return (
                <StatusPanel
                  key={node.id}
                  title={`${ds?.title || 'Design System'} DESIGN.md`}
                  status={optional ? 'optional' : documentStatusLabel(designMdStatusLabel(dsStatus))}
                  tone={optional ? 'neutral' : designMdStatusTone(dsStatus)}
                  animated={dsStatus === 'generating'}
                  density="compact"
                  actions={docHasContent || canRefreshDesignMd ? (
                    <>
                      {docHasContent ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="iconSm"
                          aria-label={`View ${ds?.title || 'Design System'} DESIGN.md`}
                          title={`View ${ds?.title || 'Design System'} DESIGN.md`}
                          onClick={() => setDesignMdModalNodeId(node.id)}
                        >
                          <Eye size={11} aria-hidden />
                        </Button>
                      ) : null}
                      {canRefreshDesignMd ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="iconSm"
                          disabled={isCompiling || contextGenerating || Boolean(designMdGeneratingNodeId)}
                          aria-label={`Refresh ${ds?.title || 'Design System'} DESIGN.md`}
                          title={`Refresh ${ds?.title || 'Design System'} DESIGN.md`}
                          onClick={() => handleRefreshDesignMdDocument(node.id)}
                        >
                          <RefreshCw size={11} aria-hidden />
                        </Button>
                      ) : null}
                    </>
                  ) : undefined}
                >
                  {doc?.error && dsStatus !== 'generating' ? (
                    <span className="text-error">{doc.error}</span>
                  ) : null}
                </StatusPanel>
              );
            })}
          </div>

          <div className="space-y-2">
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
                <Badge shape="pill" tone="warning">{hint}</Badge>
              </div>
            )}

            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={handleIncubate}
              disabled={isCompiling || contextGenerating || Boolean(designMdGeneratingNodeId) || !isReady}
              aria-busy={isCompiling || contextGenerating || Boolean(designMdGeneratingNodeId)}
              aria-label={isCompiling || contextGenerating || designMdGeneratingNodeId ? 'Incubating…' : 'Generate hypotheses'}
              title={isCompiling || contextGenerating || designMdGeneratingNodeId ? 'Incubating…' : undefined}
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
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={handleAddBlank}
              disabled={isCompiling || contextGenerating || Boolean(designMdGeneratingNodeId) || !isReady}
              aria-label="Add blank hypothesis card"
              title={isCompiling || contextGenerating || designMdGeneratingNodeId ? 'Incubating…' : readinessBlockReason}
            >
              <Plus size={12} strokeWidth={2} aria-hidden />
              Blank hypothesis
            </Button>
          </div>
        </div>

        {totalHypotheses > 0 && !isCompiling && !contextGenerating && !designMdGeneratingNodeId && (
          <p className="text-nano text-fg-secondary">
            {totalHypotheses} {totalHypotheses === 1 ? 'hypothesis' : 'hypotheses'} total
          </p>
        )}
      </div>

      <Modal
        open={contextModalOpen}
        onClose={() => setContextModalOpen(false)}
        title="Design specification"
        size="lg"
      >
        <DocumentViewer
          content={internalContextDoc?.content}
          emptyMessage="No design specification has been generated yet."
          metadata={
            internalContextDoc ? (
              <>
                <div>Generated: {internalContextDoc.generatedAt}</div>
                <div>Model: {internalContextDoc.providerId} / {internalContextDoc.modelId}</div>
                <div>Source: {internalContextStale ? 'stale' : 'current'}</div>
              </>
            ) : null
          }
        />
      </Modal>

      <Modal
        open={Boolean(designMdModalNodeId)}
        onClose={() => setDesignMdModalNodeId(null)}
        title={activeDesignMdModalData?.title ? `${activeDesignMdModalData.title} DESIGN.md` : 'DESIGN.md'}
        size="lg"
      >
        <DocumentViewer
          content={activeDesignMdModalData?.designMdDocument?.content}
          emptyMessage="No DESIGN.md document has been generated yet."
          metadata={
            activeDesignMdModalData?.designMdDocument ? (
              <>
                <div>Generated: {activeDesignMdModalData.designMdDocument.generatedAt}</div>
                <div>Model: {activeDesignMdModalData.designMdDocument.providerId} / {activeDesignMdModalData.designMdDocument.modelId}</div>
                <div>
                  Source: {isDesignMdDocumentStale(
                    designSystemSourceFromNodeData(activeDesignMdModalData),
                    activeDesignMdModalData.designMdDocument,
                  ) ? 'stale' : 'current'}
                </div>
                {activeDesignMdModalData.designMdDocument.lint ? (
                  <div>
                    Lint: {activeDesignMdModalData.designMdDocument.lint.errors} errors, {activeDesignMdModalData.designMdDocument.lint.warnings} warnings, {activeDesignMdModalData.designMdDocument.lint.infos} info
                  </div>
                ) : null}
              </>
            ) : null
          }
        />
      </Modal>
    </NodeShell>
  );
}

export default memo(IncubatorNode);
