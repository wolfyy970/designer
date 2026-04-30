import { now } from '../lib/utils';
import { useCanvasStore } from '../stores/canvas-store';
import { useGenerationStore } from '../stores/generation-store';
import { useIncubatorStore } from '../stores/incubator-store';
import { useSpecStore } from '../stores/spec-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { SAVED_CANVAS_SNAPSHOT_VERSION, type SavedCanvasSnapshot } from '../types/saved-canvas';
import { captureSnapshotArtifacts } from './canvas-snapshot-artifacts';
import { stripLegacyExistingDesignGraph, stripLegacyExistingDesignSpec } from './canvas-snapshot-legacy';
import { snapshotClone, toRestorableGenerationResult } from './canvas-snapshot-serialization';

export async function captureCurrentCanvasSnapshot(): Promise<SavedCanvasSnapshot> {
  const spec = stripLegacyExistingDesignSpec(useSpecStore.getState().spec);
  const canvas = useCanvasStore.getState();
  const graph = stripLegacyExistingDesignGraph(
    snapshotClone(canvas.nodes.filter((node) => node.type !== 'inputGhost')),
    snapshotClone(canvas.edges),
  );
  const domain = useWorkspaceDomainStore.getState();
  const incubator = useIncubatorStore.getState();
  const generation = useGenerationStore.getState();
  const results = generation.results.map(toRestorableGenerationResult);

  return {
    schemaVersion: SAVED_CANVAS_SNAPSHOT_VERSION,
    savedAt: now(),
    spec,
    canvas: {
      nodes: graph.nodes,
      edges: graph.edges,
      viewport: snapshotClone(canvas.viewport),
      showMiniMap: canvas.showMiniMap,
      colGap: canvas.colGap,
    },
    workspaceDomain: {
      incubatorWirings: snapshotClone(domain.incubatorWirings),
      incubatorModelNodeIds: snapshotClone(domain.incubatorModelNodeIds),
      hypotheses: snapshotClone(domain.hypotheses),
      modelProfiles: snapshotClone(domain.modelProfiles),
      designSystems: snapshotClone(domain.designSystems),
      previewSlots: snapshotClone(domain.previewSlots),
    },
    incubator: {
      incubationPlans: snapshotClone(incubator.incubationPlans),
      compiledPrompts: snapshotClone(incubator.compiledPrompts),
      selectedProvider: incubator.selectedProvider,
      selectedModel: incubator.selectedModel,
    },
    generation: {
      results,
      selectedVersions: snapshotClone(generation.selectedVersions),
      userBestOverrides: snapshotClone(generation.userBestOverrides),
    },
    artifacts: await captureSnapshotArtifacts(results),
  };
}
