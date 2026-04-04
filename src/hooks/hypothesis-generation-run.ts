import type {
  HypothesisGenerateApiPayload,
  HypothesisPromptBundleResponse,
} from '../api/types';
import type { CompiledPrompt } from '../types/compiler';
import type { GenerationResult } from '../types/provider';
import type { HypothesisGenerationContext } from '../workspace/hypothesis-generation-pure';
import { GENERATION_MODE, GENERATION_STATUS } from '../constants/generation';
import {
  createPlaceholderGenerationSession,
  runFinalizeWithCatch,
} from './placeholder-generation-session';
import { provenanceFromHypothesisContext } from '../workspace/workspace-session';
import type { HypothesisLaneSession } from '../api/client';

export function applyGenerationFailureToLanes(
  lanePlaceholderIds: readonly string[],
  message: string,
  getResults: () => GenerationResult[],
  updateResult: (id: string, patch: Partial<GenerationResult>) => void,
): void {
  for (const id of lanePlaceholderIds) {
    const r = getResults().find((x) => x.id === id);
    if (r?.status === GENERATION_STATUS.GENERATING) {
      updateResult(id, { status: GENERATION_STATUS.ERROR, error: message });
    }
  }
}

export type HypothesisGenerationRunResult =
  | { ok: true; lanePlaceholderIds: string[]; modelCredentialCount: number }
  | { ok: false; reason: 'no_prompt' };

export interface HypothesisGenerationRunDeps {
  workspacePayload: HypothesisGenerateApiPayload;
  genCtx: HypothesisGenerationContext;
  nodeId: string;
  runId: string;
  signal: AbortSignal;
  setCompiledPrompts: (prompts: CompiledPrompt[]) => void;
  addResult: (r: GenerationResult) => void;
  updateResult: (id: string, patch: Partial<GenerationResult>) => void;
  nextRunNumberForStrategy: (strategyId: string) => number;
  syncAfterGenerate: (results: GenerationResult[], hypothesisNodeId: string) => void;
  getCanvasState: () => {
    previewNodeIdMap: Map<string, string>;
    setRunInspectorPreview: (id: string | null) => void;
  };
  scheduleFitView: () => void;
  fetchBundle: (
    body: HypothesisGenerateApiPayload,
    signal?: AbortSignal,
  ) => Promise<HypothesisPromptBundleResponse>;
  runStream: (
    body: HypothesisGenerateApiPayload,
    lanes: HypothesisLaneSession[],
    signal?: AbortSignal,
  ) => Promise<void>;
  /** Called after lane placeholders exist and before SSE starts (so catch can mark lanes on stream errors). */
  onLaneIdsReady: (ids: readonly string[]) => void;
}

/**
 * Fetches prompt bundle, creates lane placeholders/sessions, syncs canvas, runs multiplexed SSE.
 * Caller owns abort, edge status, and aggregate error UI (try/finally).
 */
export async function executeHypothesisGenerationRun(
  deps: HypothesisGenerationRunDeps,
  onLaneComplete: (placeholderId: string) => void,
): Promise<HypothesisGenerationRunResult> {
  const bundle = await deps.fetchBundle(deps.workspacePayload, deps.signal);
  deps.setCompiledPrompts(bundle.prompts);
  const prompt = bundle.prompts[0];
  if (!prompt) return { ok: false, reason: 'no_prompt' };

  const provenanceCtx =
    bundle.provenance ?? provenanceFromHypothesisContext(deps.genCtx);

  const lanePlaceholderIds: string[] = [];
  const placeholderResults: GenerationResult[] = [];
  const laneSessions: HypothesisLaneSession[] = [];

  for (const cred of bundle.generationContext.modelCredentials) {
    const placeholderId = crypto.randomUUID();
    const currentRunNumber = deps.nextRunNumberForStrategy(prompt.strategyId);
    const result: GenerationResult = {
      id: placeholderId,
      strategyId: prompt.strategyId,
      providerId: cred.providerId,
      status: GENERATION_STATUS.GENERATING,
      runId: deps.runId,
      runNumber: currentRunNumber,
      metadata: { model: cred.modelId },
    };
    deps.addResult(result);
    placeholderResults.push(result);
    lanePlaceholderIds.push(placeholderId);

    const { callbacks, finalizeAfterStream } = createPlaceholderGenerationSession({
      placeholderId,
      prompt,
      providerId: cred.providerId,
      model: cred.modelId,
      mode: bundle.generationContext.agentMode,
      provenanceCtx,
      updateResult: deps.updateResult,
      correlationId: deps.runId,
      onResultComplete: onLaneComplete,
    });

    laneSessions.push({
      callbacks,
      finalizeAfterStream: () =>
        runFinalizeWithCatch(finalizeAfterStream, placeholderId, deps.updateResult),
    });
  }

  deps.syncAfterGenerate(placeholderResults, deps.nodeId);
  if (bundle.generationContext.agentMode === GENERATION_MODE.AGENTIC) {
    const canvas = deps.getCanvasState();
    const previewNodeId = canvas.previewNodeIdMap.get(prompt.strategyId);
    if (previewNodeId) canvas.setRunInspectorPreview(previewNodeId);
  }
  deps.scheduleFitView();

  deps.onLaneIdsReady(lanePlaceholderIds);
  await deps.runStream(deps.workspacePayload, laneSessions, deps.signal);
  return {
    ok: true,
    lanePlaceholderIds,
    modelCredentialCount: bundle.generationContext.modelCredentials.length,
  };
}
