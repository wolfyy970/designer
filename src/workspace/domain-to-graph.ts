/**
 * View/projection helpers: derive canvas-relevant metrics from domain state.
 * Full graph projection (nodes/edges from domain only) can extend this module later.
 */
import type { DomainIncubatorWiring } from '../types/workspace-domain';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';

export function getDomainIncubatorWiring(incubatorId: string): DomainIncubatorWiring | undefined {
  return useWorkspaceDomainStore.getState().incubatorWirings[incubatorId];
}

/** Pure count of structural inputs on an incubator wiring record (no store). */
export function countStructuralInputs(w: DomainIncubatorWiring): number {
  return w.sectionNodeIds.length + w.variantNodeIds.length + w.critiqueNodeIds.length;
}

/** When domain has wiring, use it for input counts; otherwise returns null (use edges). */
export function domainIncubatorStructuralInputCount(incubatorId: string): number | null {
  const w = getDomainIncubatorWiring(incubatorId);
  if (!w) return null;
  return countStructuralInputs(w);
}
