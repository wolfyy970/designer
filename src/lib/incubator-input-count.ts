import { INPUT_NODE_TYPES } from '../constants/canvas';
import type { CanvasNodeType } from '../stores/canvas-store';
import type { DomainIncubatorWiring } from '../types/workspace-domain';

/**
 * Minimum node/edge shape we need — matches both `WorkspaceNode` and
 * React Flow `Node` at the field level, avoiding an import cycle.
 */
interface CountableNode {
  id: string;
  type?: string;
}
interface CountableEdge {
  source: string;
  target: string;
}

/**
 * Count the input + preview sources that will actually feed into
 * `buildIncubateInputs` for the given incubator.
 *
 * Mirrors the priority in `buildIncubateInputs`:
 *   1. If domain wiring has any entries, it is authoritative — but
 *      stale IDs (referring to deleted nodes) must be filtered out
 *      against the live canvas, since `buildIncubateInputs` drops
 *      them silently via `nodes.filter(n => idSet.has(n.id))`.
 *   2. Otherwise fall back to incoming edges, deduped by source node id
 *      so multi-edge pairs do not inflate the count.
 *
 * Returning the *effective* count (what actually flows into incubation)
 * prevents the UI from claiming "5 inputs connected" while the server
 * only sees 1 because 4 of those IDs point to deleted nodes.
 */
export function countConnectedIncubatorInputs(
  nodes: CountableNode[],
  edges: CountableEdge[],
  incubatorId: string,
  wiring?: DomainIncubatorWiring | null,
): number {
  if (
    wiring &&
    (wiring.inputNodeIds.length > 0 || wiring.previewNodeIds.length > 0)
  ) {
    const liveIds = new Set(nodes.map((n) => n.id));
    let count = 0;
    for (const nid of wiring.inputNodeIds) if (liveIds.has(nid)) count += 1;
    for (const nid of wiring.previewNodeIds) if (liveIds.has(nid)) count += 1;
    if (count > 0) return count;
    // Fall through to edge fallback when every wired id is stale.
  }

  const uniqueSources = new Set<string>();
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  for (const e of edges) {
    if (e.target !== incubatorId) continue;
    const src = nodeById.get(e.source);
    if (!src?.type) continue;
    if (INPUT_NODE_TYPES.has(src.type as CanvasNodeType) || src.type === 'preview') {
      uniqueSources.add(e.source);
    }
  }
  return uniqueSources.size;
}
