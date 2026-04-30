import { STORAGE_KEYS } from '../lib/storage-keys';
import { useCanvasStore } from '../stores/canvas-store';
import { useGenerationStore } from '../stores/generation-store';
import { useIncubatorStore } from '../stores/incubator-store';
import { useSpecStore } from '../stores/spec-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import type { SavedCanvasSnapshot } from '../types/saved-canvas';
import { restoreSnapshotArtifacts } from './canvas-snapshot-artifacts';
import { stripLegacyExistingDesignGraph, stripLegacyExistingDesignSpec } from './canvas-snapshot-legacy';
import { snapshotClone } from './canvas-snapshot-serialization';

export async function restoreCanvasSnapshot(snapshot: SavedCanvasSnapshot): Promise<void> {
  const spec = stripLegacyExistingDesignSpec(snapshot.spec);
  const graph = stripLegacyExistingDesignGraph(
    snapshotClone(snapshot.canvas.nodes),
    snapshotClone(snapshot.canvas.edges),
  );
  useSpecStore.getState().loadCanvas(spec);
  useCanvasStore.setState({
    nodes: graph.nodes,
    edges: graph.edges,
    viewport: snapshotClone(snapshot.canvas.viewport),
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
    incubatorWirings: Object.fromEntries(
      Object.entries(snapshotClone(snapshot.workspaceDomain.incubatorWirings)).map(([id, wiring]) => [
        id,
        {
          ...wiring,
          inputNodeIds: wiring.inputNodeIds.filter((nodeId) => !graph.removedNodeIds.has(nodeId)),
        },
      ]),
    ),
    incubatorModelNodeIds: snapshotClone(snapshot.workspaceDomain.incubatorModelNodeIds),
    hypotheses: snapshotClone(snapshot.workspaceDomain.hypotheses),
    modelProfiles: snapshotClone(snapshot.workspaceDomain.modelProfiles),
    designSystems: snapshotClone(snapshot.workspaceDomain.designSystems),
    previewSlots: snapshotClone(snapshot.workspaceDomain.previewSlots),
  });
  useIncubatorStore.setState({
    incubationPlans: snapshotClone(snapshot.incubator.incubationPlans),
    compiledPrompts: snapshotClone(snapshot.incubator.compiledPrompts),
    isCompiling: false,
    error: null,
    selectedProvider: snapshot.incubator.selectedProvider,
    selectedModel: snapshot.incubator.selectedModel,
  });
  useGenerationStore.setState({
    results: snapshotClone(snapshot.generation.results),
    isGenerating: false,
    selectedVersions: snapshotClone(snapshot.generation.selectedVersions),
    userBestOverrides: snapshotClone(snapshot.generation.userBestOverrides),
  });
  localStorage.setItem(STORAGE_KEYS.ACTIVE_CANVAS, JSON.stringify({ state: { spec }, version: 1 }));
  await restoreSnapshotArtifacts(snapshot);
}
