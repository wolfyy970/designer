/**
 * Pure helpers: preview slots ↔ canvas nodes (hypothesis-scoped navigation).
 */
import type { DomainPreviewSlot } from '../types/workspace-domain';

/** Find hypothesis id that owns this preview canvas node, if any. */
export function findHypothesisIdForPreviewNode(
  previewSlots: Record<string, DomainPreviewSlot>,
  previewNodeId: string,
): string | undefined {
  for (const slot of Object.values(previewSlots)) {
    if (slot.previewNodeId === previewNodeId) return slot.hypothesisId;
  }
  return undefined;
}

/** All preview node ids registered for a hypothesis (non-null, unique order by slot iteration). */
export function getPreviewNodeIdsForHypothesis(
  previewSlots: Record<string, DomainPreviewSlot>,
  hypothesisId: string,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const slot of Object.values(previewSlots)) {
    if (slot.hypothesisId !== hypothesisId) continue;
    const nid = slot.previewNodeId;
    if (nid && !seen.has(nid)) {
      seen.add(nid);
      ids.push(nid);
    }
  }
  return ids;
}
