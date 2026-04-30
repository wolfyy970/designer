import type { GenerationResult } from '../types/provider';
import type { SavedCanvasArtifactBundle, SavedCanvasSnapshot } from '../types/saved-canvas';
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

export async function captureSnapshotArtifacts(
  results: GenerationResult[],
): Promise<Record<string, SavedCanvasArtifactBundle>> {
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
