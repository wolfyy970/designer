/**
 * Module-level ephemeral set of hypothesis node IDs that should trigger
 * auto-generation immediately on mount.
 *
 * Written by HypothesisGhostNode when the user clicks "Generate" (rather than
 * "Blank"). Consumed (and cleared) by HypothesisNode's mount effect.
 * No Zustand needed — this never needs to persist across page loads or cause
 * re-renders; it just needs to survive long enough for the new node to mount.
 */
const pendingAutoGenerate = new Set<string>();

export function markPendingAutoGenerate(nodeId: string): void {
  pendingAutoGenerate.add(nodeId);
}

/**
 * Returns true and removes the entry if `nodeId` was flagged for auto-generate.
 * Safe to call multiple times — only the first call returns true.
 */
export function consumePendingAutoGenerate(nodeId: string): boolean {
  if (pendingAutoGenerate.has(nodeId)) {
    pendingAutoGenerate.delete(nodeId);
    return true;
  }
  return false;
}
