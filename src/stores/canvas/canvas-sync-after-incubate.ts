import { columnX, snap } from '../../lib/canvas-layout';
import {
  buildAutoConnectEdges,
  buildModelEdgesFromParent,
  dedupeEdgesById,
} from '../../lib/canvas-connections';
import { EDGE_STATUS } from '../../constants/canvas';
import { linkHypothesesAfterIncubate, syncDomainForNewEdge } from '../../workspace/domain-commands';
import {
  HYPOTHESIS_STACK_GAP,
  HYPOTHESIS_STACK_NODE_H,
  HYPOTHESIS_STACK_SPACING,
} from './hypothesis-layout-constants';
import type { CanvasStore } from './canvas-store-types';
import type { HypothesisStrategy } from '../../types/incubator';

/**
 * Canvas + workspace sync after incubation creates new hypothesis strategies.
 * Extracted from `canvas-store-sync-slice` for readability (stable behavior).
 */
export function applySyncAfterIncubate(
  get: () => CanvasStore,
  set: (partial: Partial<CanvasStore>) => void,
  newStrategies: HypothesisStrategy[],
  incubatorNodeId: string,
): void {
  if (newStrategies.length === 0) return;
  const state = get();
  /** Normalize in case persisted/corrupt graph had duplicate edge ids (React Flow keys must be unique). */
  const addedEdges = dedupeEdgesById([...state.edges]);
  const col = columnX(state.colGap);
  const incubatorCanvasNode = state.nodes.find((n) => n.id === incubatorNodeId);
  const incubatorY = incubatorCanvasNode?.position.y ?? 300;

  const existingHypIds = new Set(
    state.nodes.filter((n) => n.type === 'hypothesis').map((n) => n.data.refId),
  );

  let maxY = incubatorY;
  for (const e of state.edges) {
    if (e.source !== incubatorNodeId) continue;
    const target = state.nodes.find((n) => n.id === e.target && n.type === 'hypothesis');
    if (target) {
      const bottom = target.position.y + (target.measured?.height ?? 300);
      if (bottom > maxY) maxY = bottom;
    }
  }

  const addedNodes = [...state.nodes];
  let placed = 0;

  const strategyLinkPairs: { hypothesisNodeId: string; strategyId: string }[] = [];

  newStrategies.forEach((strategy) => {
    if (existingHypIds.has(strategy.id)) return;

    const nodeId = `hypothesis-${strategy.id}`;
    addedNodes.push({
      id: nodeId,
      type: 'hypothesis',
      position: snap({
        x: col.hypothesis,
        y: maxY + HYPOTHESIS_STACK_GAP + placed * (HYPOTHESIS_STACK_NODE_H + HYPOTHESIS_STACK_SPACING),
      }),
      data: { refId: strategy.id },
    });
    placed++;
    strategyLinkPairs.push({ hypothesisNodeId: nodeId, strategyId: strategy.id });

    const structuralEdges = buildAutoConnectEdges(nodeId, 'hypothesis', addedNodes);
    for (const se of structuralEdges) {
      if (addedEdges.some((e) => e.id === se.id)) continue;
      const incubationComplete = se.source === incubatorNodeId && se.target === nodeId;
      addedEdges.push({
        ...se,
        data: {
          status: incubationComplete ? EDGE_STATUS.COMPLETE : se.data.status,
        },
      });
    }
  });

  if (placed === 0) return;

  const newHypothesisIds = strategyLinkPairs.map((p) => p.hypothesisNodeId);

  const modelEdges = buildModelEdgesFromParent(
    incubatorNodeId,
    newHypothesisIds,
    addedNodes,
    addedEdges,
  );
  for (const me of modelEdges) {
    if (addedEdges.some((e) => e.id === me.id)) continue;
    addedEdges.push(me);
  }

  const nextEdges = dedupeEdgesById(addedEdges);
  set({ nodes: addedNodes, edges: nextEdges });
  linkHypothesesAfterIncubate(incubatorNodeId, strategyLinkPairs);
  const prevEdgeIds = new Set(state.edges.map((e) => e.id));
  const graphNodes = get().nodes;
  const graphEdges = get().edges;
  for (const e of nextEdges) {
    if (!prevEdgeIds.has(e.id)) {
      syncDomainForNewEdge(e, graphNodes, graphEdges);
    }
  }

  if (get().autoLayout) get().applyAutoLayout();
}
