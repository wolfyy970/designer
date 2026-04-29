import { GENERATION_STATUS } from '../constants/generation';
import { STORAGE_KEYS } from '../lib/storage-keys';
import { now } from '../lib/utils';
import { useCanvasStore } from '../stores/canvas-store';
import { useGenerationStore } from '../stores/generation-store';
import { useIncubatorStore } from '../stores/incubator-store';
import { useSpecStore } from '../stores/spec-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import {
  loadCode,
  loadFiles,
  loadProvenance,
  loadRoundFiles,
  saveCode,
  saveFiles,
  saveProvenance,
  saveRoundFiles,
} from './idb-storage';
import {
  SAVED_CANVAS_SNAPSHOT_VERSION,
  type SavedCanvasArtifactBundle,
  type SavedCanvasSnapshot,
} from '../types/saved-canvas';
import type { GenerationResult } from '../types/provider';

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toRestorableResult(result: GenerationResult): GenerationResult {
  const copy = cloneJson(result);
  delete copy.code;
  delete copy.liveCode;
  delete copy.liveFiles;
  delete copy.liveFilesPlan;
  delete copy.liveTodos;
  delete copy.liveTrace;
  delete copy.liveSkills;
  delete copy.liveActivatedSkills;
  delete copy.agenticPhase;
  delete copy.evaluationStatus;
  delete copy.lastAgentFileAt;
  delete copy.lastActivityAt;
  delete copy.lastTraceAt;
  delete copy.activeToolName;
  delete copy.activeToolPath;
  delete copy.streamingToolName;
  delete copy.streamingToolPath;
  delete copy.streamingToolChars;
  delete copy.streamedModelChars;
  delete copy.streamMode;
  delete copy.liveEvalWorkers;

  if (copy.status === GENERATION_STATUS.GENERATING) {
    copy.status = GENERATION_STATUS.ERROR;
    copy.error = 'Generation stopped.';
  }

  if (copy.evaluationSummary) {
    const evaluationSummary = { ...copy.evaluationSummary };
    delete evaluationSummary.evaluatorTraces;
    copy.evaluationSummary = evaluationSummary;
  }

  if (copy.evaluationRounds?.length) {
    copy.evaluationRounds = copy.evaluationRounds.map((round) => {
      const next = { ...round };
      delete next.files;
      if (next.aggregate) {
        const aggregate = { ...next.aggregate };
        delete aggregate.evaluatorTraces;
        next.aggregate = aggregate;
      }
      for (const slot of ['design', 'strategy', 'implementation', 'browser'] as const) {
        const report = next[slot];
        if (report && typeof report === 'object' && 'rawTrace' in report) {
          const { rawTrace: _rawTrace, ...rest } = report;
          void _rawTrace;
          next[slot] = rest as typeof report;
        }
      }
      return next;
    });
  }

  return copy;
}

async function captureArtifacts(results: GenerationResult[]): Promise<Record<string, SavedCanvasArtifactBundle>> {
  const artifacts: Record<string, SavedCanvasArtifactBundle> = {};
  for (const result of results) {
    const bundle: SavedCanvasArtifactBundle = {};
    const [code, files, provenance] = await Promise.all([
      loadCode(result.id),
      loadFiles(result.id),
      loadProvenance(result.id),
    ]);
    if (code !== undefined) bundle.code = code;
    if (files !== undefined) bundle.files = files;
    if (provenance !== undefined) bundle.provenance = provenance;

    if (result.evaluationRounds?.length) {
      const roundFiles: SavedCanvasArtifactBundle['roundFiles'] = {};
      for (const round of result.evaluationRounds) {
        const filesForRound = await loadRoundFiles(result.id, round.round);
        if (filesForRound !== undefined) {
          roundFiles[round.round] = filesForRound;
        }
      }
      if (Object.keys(roundFiles).length > 0) bundle.roundFiles = roundFiles;
    }

    if (Object.keys(bundle).length > 0) artifacts[result.id] = bundle;
  }
  return artifacts;
}

export async function restoreSnapshotArtifacts(snapshot: SavedCanvasSnapshot): Promise<void> {
  for (const [resultId, bundle] of Object.entries(snapshot.artifacts)) {
    const writes: Promise<void>[] = [];
    if (bundle.code !== undefined) writes.push(saveCode(resultId, bundle.code));
    if (bundle.files !== undefined) writes.push(saveFiles(resultId, bundle.files));
    if (bundle.provenance !== undefined) writes.push(saveProvenance(resultId, bundle.provenance));
    if (bundle.roundFiles) {
      for (const [round, files] of Object.entries(bundle.roundFiles)) {
        writes.push(saveRoundFiles(resultId, Number(round), files));
      }
    }
    await Promise.all(writes);
  }
}

export async function captureCurrentCanvasSnapshot(): Promise<SavedCanvasSnapshot> {
  const spec = cloneJson(useSpecStore.getState().spec);
  const canvas = useCanvasStore.getState();
  const domain = useWorkspaceDomainStore.getState();
  const incubator = useIncubatorStore.getState();
  const generation = useGenerationStore.getState();
  const results = generation.results.map(toRestorableResult);

  return {
    schemaVersion: SAVED_CANVAS_SNAPSHOT_VERSION,
    savedAt: now(),
    spec,
    canvas: {
      nodes: cloneJson(canvas.nodes.filter((node) => node.type !== 'inputGhost')),
      edges: cloneJson(canvas.edges),
      viewport: cloneJson(canvas.viewport),
      showMiniMap: canvas.showMiniMap,
      colGap: canvas.colGap,
    },
    workspaceDomain: {
      incubatorWirings: cloneJson(domain.incubatorWirings),
      incubatorModelNodeIds: cloneJson(domain.incubatorModelNodeIds),
      hypotheses: cloneJson(domain.hypotheses),
      modelProfiles: cloneJson(domain.modelProfiles),
      designSystems: cloneJson(domain.designSystems),
      previewSlots: cloneJson(domain.previewSlots),
    },
    incubator: {
      incubationPlans: cloneJson(incubator.incubationPlans),
      compiledPrompts: cloneJson(incubator.compiledPrompts),
      selectedProvider: incubator.selectedProvider,
      selectedModel: incubator.selectedModel,
    },
    generation: {
      results,
      selectedVersions: cloneJson(generation.selectedVersions),
      userBestOverrides: cloneJson(generation.userBestOverrides),
    },
    artifacts: await captureArtifacts(results),
  };
}

export async function restoreCanvasSnapshot(snapshot: SavedCanvasSnapshot): Promise<void> {
  useSpecStore.getState().loadCanvas(snapshot.spec);
  useCanvasStore.setState({
    nodes: cloneJson(snapshot.canvas.nodes),
    edges: cloneJson(snapshot.canvas.edges),
    viewport: cloneJson(snapshot.canvas.viewport),
    showMiniMap: snapshot.canvas.showMiniMap,
    colGap: snapshot.canvas.colGap,
    expandedPreviewId: null,
    runInspectorPreviewNodeId: null,
    lineageNodeIds: new Set<string>(),
    lineageEdgeIds: new Set<string>(),
    previewNodeIdMap: new Map<string, string>(),
    connectingFrom: null,
    pendingFitViewAfterTemplate: false,
  });
  useWorkspaceDomainStore.setState({
    incubatorWirings: cloneJson(snapshot.workspaceDomain.incubatorWirings),
    incubatorModelNodeIds: cloneJson(snapshot.workspaceDomain.incubatorModelNodeIds),
    hypotheses: cloneJson(snapshot.workspaceDomain.hypotheses),
    modelProfiles: cloneJson(snapshot.workspaceDomain.modelProfiles),
    designSystems: cloneJson(snapshot.workspaceDomain.designSystems),
    previewSlots: cloneJson(snapshot.workspaceDomain.previewSlots),
  });
  useIncubatorStore.setState({
    incubationPlans: cloneJson(snapshot.incubator.incubationPlans),
    compiledPrompts: cloneJson(snapshot.incubator.compiledPrompts),
    isCompiling: false,
    error: null,
    selectedProvider: snapshot.incubator.selectedProvider,
    selectedModel: snapshot.incubator.selectedModel,
  });
  useGenerationStore.setState({
    results: cloneJson(snapshot.generation.results),
    isGenerating: false,
    selectedVersions: cloneJson(snapshot.generation.selectedVersions),
    userBestOverrides: cloneJson(snapshot.generation.userBestOverrides),
  });
  localStorage.setItem(STORAGE_KEYS.ACTIVE_CANVAS, JSON.stringify({ state: { spec: snapshot.spec }, version: 1 }));
  await restoreSnapshotArtifacts(snapshot);
}
