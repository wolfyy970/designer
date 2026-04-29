import type { Dispatch, SetStateAction } from 'react';
import type { FitViewOptions } from '@xyflow/react';
import type { DesignSpec } from '../types/spec';
import type { HypothesisStrategy } from '../types/incubator';
import { useCanvasStore } from '../stores/canvas-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { useGenerationStore, nextRunNumber } from '../stores/generation-store';
import { scheduleCanvasFitViewToNodes } from '../lib/canvas-fit-view';
import { DEFAULT_INCUBATOR_PROVIDER } from '../lib/constants';
import { warnIfWorkspaceSnapshotInvalid } from '../lib/workspace-snapshot-warn';
import { normalizeError } from '../lib/error-utils';
import { pinModelCredentialsIfLockdown } from '../lib/lockdown-model';
import {
  buildHypothesisGenerationContextFromInputs,
  normalizeModelProfilesForApi,
  workspaceSnapshotWireToGraph,
} from '../workspace/hypothesis-generation-pure';
import { GENERATION_STATUS } from '../constants/generation';
import { EDGE_STATUS } from '../constants/canvas';
import {
  fetchHypothesisPromptBundle,
  generateHypothesisStream,
} from '../api/client';
import type { HypothesisGenerateApiPayload } from '../api/types';
import {
  applyGenerationFailureToLanes,
  executeHypothesisGenerationRun,
} from './hypothesis-generation-run';
import {
  clearGenerationAbortController,
  GENERATION_STOPPED_MESSAGE,
  isAbortError,
  swapGenerationAbortController,
} from '../lib/generation-abort-registry';
import type { CanvasStore } from '../stores/canvas/canvas-store-types';
import type { CompiledPrompt } from '../types/incubator';
import type { GenerationResult } from '../types/provider';
import { resolveEvaluatorSettings } from './resolveEvaluatorSettings';
import { LOST_STREAM_CONNECTION_MESSAGE } from '../api/client-sse-lifecycle';

export interface GenerationProgress {
  completed: number;
  total: number;
}

export interface HypothesisGenerateFlowParams {
  nodeId: string;
  strategyId: string;
  strategy: HypothesisStrategy;
  spec: DesignSpec;
  lockdown: boolean;
  /** Vision capability of the connected model(s), same as compile — forwarded to hypothesis API. */
  supportsVision?: boolean;
  fitView: (options?: FitViewOptions) => void;
  setCompiledPrompts: (prompts: CompiledPrompt[]) => void;
  setGenerating: (isGenerating: boolean) => void;
  addResult: (result: GenerationResult) => void;
  updateResult: (id: string, patch: Partial<GenerationResult>) => void;
  syncAfterGenerate: CanvasStore['syncAfterGenerate'];
  setEdgeStatusBySource: CanvasStore['setEdgeStatusBySource'];
  setEdgeStatusByTarget: CanvasStore['setEdgeStatusByTarget'];
  clearPreviewNodeIdMap: CanvasStore['clearPreviewNodeIdMap'];
  setGenerationProgress: Dispatch<SetStateAction<GenerationProgress | null>>;
  setGenerationError: Dispatch<SetStateAction<string | null>>;
}

/**
 * Orchestrates hypothesis prompt bundle + multiplexed SSE; used from {@link useHypothesisGeneration}.
 */
export async function runHypothesisGenerateFlow({
  nodeId,
  strategyId,
  strategy,
  spec,
  lockdown,
  supportsVision,
  fitView,
  setCompiledPrompts,
  setGenerating,
  addResult,
  updateResult,
  syncAfterGenerate,
  setEdgeStatusBySource,
  setEdgeStatusByTarget,
  clearPreviewNodeIdMap,
  setGenerationProgress,
  setGenerationError,
}: HypothesisGenerateFlowParams): Promise<void> {
  const snapshot = useCanvasStore.getState();

  const runId = crypto.randomUUID();

  const domain = useWorkspaceDomainStore.getState();
  const evalSettings = resolveEvaluatorSettings(nodeId);
  const workspacePayload: HypothesisGenerateApiPayload = {
    hypothesisNodeId: nodeId,
    hypothesisStrategy: strategy,
    spec,
    snapshot: { nodes: snapshot.nodes, edges: snapshot.edges },
    domainHypothesis: domain.hypotheses[nodeId] ?? null,
    modelProfiles: normalizeModelProfilesForApi(
      domain.modelProfiles,
      DEFAULT_INCUBATOR_PROVIDER,
      lockdown,
    ),
    designSystems: domain.designSystems,
    defaultIncubatorProvider: DEFAULT_INCUBATOR_PROVIDER,
    correlationId: runId,
    agenticMaxRevisionRounds: evalSettings.maxRevisionRounds,
    agenticMinOverallScore: evalSettings.minOverallScore ?? undefined,
    rubricWeights: evalSettings.rubricWeights,
    ...(supportsVision != null ? { supportsVision } : {}),
  };
  warnIfWorkspaceSnapshotInvalid(workspacePayload.snapshot, 'useHypothesisGeneration');

  const genCtxRaw = buildHypothesisGenerationContextFromInputs({
    hypothesisNodeId: workspacePayload.hypothesisNodeId,
    hypothesisStrategy: workspacePayload.hypothesisStrategy,
    spec: workspacePayload.spec,
    snapshot: workspaceSnapshotWireToGraph(workspacePayload.snapshot),
    domainHypothesis: workspacePayload.domainHypothesis ?? undefined,
    modelProfiles: workspacePayload.modelProfiles,
    designSystems: workspacePayload.designSystems,
    defaultIncubatorProvider: workspacePayload.defaultIncubatorProvider,
  });
  if (!genCtxRaw) {
    setGenerationError(
      'No model connected for this hypothesis. Connect a Model node to the hypothesis and try again.',
    );
    return;
  }
  const genCtx = {
    ...genCtxRaw,
    modelCredentials: pinModelCredentialsIfLockdown(genCtxRaw.modelCredentials, lockdown),
  };

  setEdgeStatusBySource(nodeId, EDGE_STATUS.PROCESSING);
  setGenerationError(null);

  setGenerating(true);
  setGenerationProgress({
    completed: 0,
    total: genCtx.modelCredentials.length,
  });

  let lanePlaceholderIds: string[] = [];
  const abortController = swapGenerationAbortController(strategyId);
  let hypothesisSourceEdgeTerminalError = false;

  try {
    const onLaneComplete = (id: string) => {
      setGenerationProgress((prev) => (prev ? { ...prev, completed: prev.completed + 1 } : null));
      const r = useGenerationStore.getState().results.find((x) => x.id === id);
      if (r) {
        const previewNodeId = useCanvasStore.getState().previewNodeIdMap.get(r.strategyId);
        if (previewNodeId) {
          setEdgeStatusByTarget(previewNodeId, EDGE_STATUS.COMPLETE);
        }
      }
    };

    const runResult = await executeHypothesisGenerationRun(
      {
        workspacePayload,
        genCtx,
        nodeId,
        runId,
        signal: abortController.signal,
        setCompiledPrompts,
        addResult,
        updateResult,
        nextRunNumberForStrategy: (strategyId) =>
          nextRunNumber(useGenerationStore.getState(), strategyId),
        syncAfterGenerate,
        scheduleFitView: () => {
          const { previewNodeIdMap } = useCanvasStore.getState();
          const previewIds = [...new Set(previewNodeIdMap.values())];
          const focusIds = [...new Set([nodeId, ...previewIds])];
          scheduleCanvasFitViewToNodes(fitView, focusIds);
        },
        fetchBundle: fetchHypothesisPromptBundle,
        runStream: generateHypothesisStream,
        onLaneIdsReady: (ids) => {
          lanePlaceholderIds = [...ids];
        },
      },
      onLaneComplete,
    );

    if (!runResult.ok) {
      hypothesisSourceEdgeTerminalError = true;
      setGenerationError('No prompt from server');
      setGenerating(false);
      setEdgeStatusBySource(nodeId, EDGE_STATUS.ERROR);
      return;
    }
  } catch (err) {
    const aborted = isAbortError(err);
    const msg = aborted ? GENERATION_STOPPED_MESSAGE : normalizeError(err, 'Generation failed');
    applyGenerationFailureToLanes(
      lanePlaceholderIds,
      msg,
      () => useGenerationStore.getState().results,
      updateResult,
    );
    if (aborted) {
      setGenerationError(null);
      setEdgeStatusBySource(nodeId, EDGE_STATUS.COMPLETE);
    } else {
      hypothesisSourceEdgeTerminalError = true;
      setGenerationError(msg);
      setEdgeStatusBySource(nodeId, EDGE_STATUS.ERROR);
    }
  } finally {
    clearGenerationAbortController(strategyId, abortController);
    clearPreviewNodeIdMap();
    if (!hypothesisSourceEdgeTerminalError) {
      setEdgeStatusBySource(nodeId, EDGE_STATUS.COMPLETE);
    }
    const stillGenerating = useGenerationStore.getState().results.some(
      (r) => r.status === GENERATION_STATUS.GENERATING,
    );
    if (!stillGenerating) setGenerating(false);

    const n = genCtx.modelCredentials.length;
    const idSet = new Set(lanePlaceholderIds);
    const erroredLaneResults = useGenerationStore
      .getState()
      .results.filter(
        (r) =>
          idSet.has(r.id) &&
          r.strategyId === strategyId &&
          r.status === GENERATION_STATUS.ERROR &&
          r.error !== GENERATION_STOPPED_MESSAGE,
      );
    const errorCount = erroredLaneResults.length;
    if (errorCount > 0) {
      const allLostConnection =
        errorCount === n &&
        erroredLaneResults.every((result) => result.error === LOST_STREAM_CONNECTION_MESSAGE);
      setGenerationError(
        allLostConnection
          ? LOST_STREAM_CONNECTION_MESSAGE
          : errorCount === n
            ? 'Generation failed'
            : `${errorCount} of ${n} failed`,
      );
    }
  }
}
