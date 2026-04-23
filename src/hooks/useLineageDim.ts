import { useCanvasStore } from '../stores/canvas-store';

/**
 * Returns a Tailwind class string for lineage-based dimming/highlighting.
 * - When no lineage is active: returns ''
 * - When lineage is active and this node IS in lineage: returns accent ring
 * - When lineage is active and this node is NOT in lineage: returns dim opacity
 *
 * Uses primitive selectors (booleans) instead of the Set reference to avoid
 * re-renders caused by Set identity changes.
 */
export function useLineageDim(nodeId: string, isSelected: boolean): string {
  const inLineage = useCanvasStore(
    (s) => s.lineageNodeIds.size > 0 && s.lineageNodeIds.has(nodeId),
  );
  const lineageActive = useCanvasStore((s) => s.lineageNodeIds.size > 0);

  if (!lineageActive) return '';
  if (inLineage) {
    return isSelected ? '' : 'ring-1 ring-accent-ring-muted';
  }
  return 'opacity-40';
}
