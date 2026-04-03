/**
 * Pure helpers: variant slots ↔ canvas nodes (hypothesis-scoped navigation).
 */
import type { DomainVariantSlot } from '../types/workspace-domain';

/** Find hypothesis id that owns this variant canvas node, if any. */
export function findHypothesisIdForVariantNode(
  variantSlots: Record<string, DomainVariantSlot>,
  variantNodeId: string,
): string | undefined {
  for (const slot of Object.values(variantSlots)) {
    if (slot.variantNodeId === variantNodeId) return slot.hypothesisId;
  }
  return undefined;
}

/** All variant node ids registered for a hypothesis (non-null, unique order by slot iteration). */
export function getVariantNodeIdsForHypothesis(
  variantSlots: Record<string, DomainVariantSlot>,
  hypothesisId: string,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const slot of Object.values(variantSlots)) {
    if (slot.hypothesisId !== hypothesisId) continue;
    const nid = slot.variantNodeId;
    if (nid && !seen.has(nid)) {
      seen.add(nid);
      ids.push(nid);
    }
  }
  return ids;
}
