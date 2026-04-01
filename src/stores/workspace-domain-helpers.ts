import { NODE_TYPES } from '../constants/canvas';
import type { CanvasNodeType } from '../types/workspace-graph';
import type { DomainIncubatorWiring } from '../types/workspace-domain';
import { defaultIncubatorWiring } from '../types/workspace-domain';

export function uniqPush(arr: string[], id: string): string[] {
  if (arr.includes(id)) return arr;
  return [...arr, id];
}

export function removeId(arr: string[], id: string): string[] {
  return arr.filter((x) => x !== id);
}

export function ensureWiring(
  wirings: Record<string, DomainIncubatorWiring>,
  incubatorId: string,
): DomainIncubatorWiring {
  return wirings[incubatorId] ?? defaultIncubatorWiring();
}

/** Section node types for incubator wiring (local copy avoids canvas-layout cycle). */
export const SECTION_NODE_TYPES_FOR_DOMAIN = new Set<CanvasNodeType>([
  NODE_TYPES.DESIGN_BRIEF,
  NODE_TYPES.EXISTING_DESIGN,
  NODE_TYPES.RESEARCH_CONTEXT,
  NODE_TYPES.OBJECTIVES_METRICS,
  NODE_TYPES.DESIGN_CONSTRAINTS,
]);

export function findIncubatorForHypothesis(
  input: { nodes: { id: string; type: string }[]; edges: { source: string; target: string }[] },
  hypothesisId: string,
): string | null {
  for (const e of input.edges) {
    if (e.target !== hypothesisId) continue;
    const src = input.nodes.find((n) => n.id === e.source);
    if (src?.type === NODE_TYPES.COMPILER) return src.id;
  }
  return null;
}
