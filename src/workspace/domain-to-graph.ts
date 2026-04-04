/**
 * View/projection helpers: derive canvas-relevant metrics from domain state.
 * Full graph projection (nodes/edges from domain only) can extend this module later.
 */
import type { DomainIncubatorWiring } from '../types/workspace-domain';

/** Pure count of structural inputs on an incubator wiring record (no store). */
export function countStructuralInputs(w: DomainIncubatorWiring): number {
  return w.sectionNodeIds.length + w.variantNodeIds.length;
}
