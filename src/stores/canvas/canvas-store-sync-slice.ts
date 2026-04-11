import type { StateCreator } from 'zustand';
import { generateId } from '../../lib/utils';
import { getPreviewNodeData } from '../../lib/canvas-node-data';
import { columnX, snap } from '../../lib/canvas-layout';
import {
  buildAutoConnectEdges,
  buildModelEdgesFromParent,
} from '../../lib/canvas-connections';
import {
  UNKNOWN_PINNED_RUN_ID,
  buildEdgeId,
  EDGE_TYPES,
  EDGE_STATUS,
} from '../../constants/canvas';
import { FORK_HYPOTHESIS_PREVIEW_STACK_OFFSET_PX } from '../../lib/constants';
import { GENERATION_STATUS } from '../../constants/generation';
import { useGenerationStore } from '../generation-store';
import { syncVariantSlotsAfterFork, syncVariantSlotsAfterGenerate } from './canvas-sync-side-effects';
import { linkHypothesesAfterIncubate, syncDomainForNewEdge } from '../../workspace/domain-commands';
import {
  HYPOTHESIS_STACK_GAP,
  HYPOTHESIS_STACK_NODE_H,
  HYPOTHESIS_STACK_SPACING,
} from './hypothesis-layout-constants';
import type { CanvasStore } from './canvas-store-types';
import { firstResultIdByStrategy } from './sync-after-generate-helpers';

export const createSyncSlice: StateCreator<
  CanvasStore,
  [],
  [],
  Pick<
    CanvasStore,
    | 'addPlaceholderHypotheses'
    | 'removePlaceholders'
    | 'syncAfterIncubate'
    | 'syncAfterGenerate'
    | 'forkHypothesisPreviews'
  >
> = (set, get) => ({
  addPlaceholderHypotheses: (incubatorNodeId, count) => {
    const state = get();
    const col = columnX(state.colGap);

    let maxY = state.nodes.find((n) => n.id === incubatorNodeId)?.position.y ?? 300;
    for (const e of state.edges) {
      if (e.source !== incubatorNodeId) continue;
      const target = state.nodes.find((n) => n.id === e.target && n.type === 'hypothesis');
      if (target) {
        const bottom = target.position.y + (target.measured?.height ?? 300);
        if (bottom > maxY) maxY = bottom;
      }
    }

    const ids: string[] = [];
    const newNodes = [...state.nodes];
    const newEdges = [...state.edges];

    for (let i = 0; i < count; i++) {
      const phId = `placeholder-${generateId()}`;
      ids.push(phId);
      newNodes.push({
        id: phId,
        type: 'hypothesis',
        position: snap({
          x: col.hypothesis,
          y: maxY + HYPOTHESIS_STACK_GAP + i * (HYPOTHESIS_STACK_NODE_H + HYPOTHESIS_STACK_SPACING),
        }),
        data: { placeholder: true },
      });
      newEdges.push({
        id: buildEdgeId(incubatorNodeId, phId),
        source: incubatorNodeId,
        target: phId,
        type: EDGE_TYPES.DATA_FLOW,
        data: { status: EDGE_STATUS.PROCESSING },
      });
    }

    set({ nodes: newNodes, edges: newEdges });
    if (get().autoLayout) get().applyAutoLayout();
    return ids;
  },

  removePlaceholders: (placeholderIds) => {
    const idSet = new Set(placeholderIds);
    set({
      nodes: get().nodes.filter((n) => !idSet.has(n.id)),
      edges: get().edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
    });
  },

  syncAfterIncubate: (newStrategies, incubatorNodeId) => {
    if (newStrategies.length === 0) return;
    const state = get();
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
    const addedEdges = [...state.edges];
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

      // Incubator→hypothesis is already included in buildAutoConnectEdges — do not push it twice
      // (duplicate ids break React Flow keys and cause flaky sync).
      const structuralEdges = buildAutoConnectEdges(nodeId, 'hypothesis', addedNodes);
      for (const se of structuralEdges) {
        const incubationComplete =
          se.source === incubatorNodeId && se.target === nodeId;
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
    addedEdges.push(...modelEdges);

    set({ nodes: addedNodes, edges: addedEdges });
    linkHypothesesAfterIncubate(incubatorNodeId, strategyLinkPairs);
    const prevEdgeIds = new Set(state.edges.map((e) => e.id));
    const graphNodes = get().nodes;
    const graphEdges = get().edges;
    for (const e of addedEdges) {
      if (!prevEdgeIds.has(e.id)) {
        syncDomainForNewEdge(e, graphNodes, graphEdges);
      }
    }

    if (get().autoLayout) get().applyAutoLayout();
  },

  syncAfterGenerate: (results, hypothesisNodeId) => {
    const state = get();
    const col = columnX(state.colGap);
    const hypothesisNode = state.nodes.find((n) => n.id === hypothesisNodeId);

    const firstRefByStrategy = firstResultIdByStrategy(results);

    const existingPreviewByStrategy = new Map<string, string>();
    for (const e of state.edges) {
      if (e.source === hypothesisNodeId) {
        const target = state.nodes.find(
          (n) => n.id === e.target && n.type === 'preview',
        );
        const previewData = target ? getPreviewNodeData(target) : undefined;
        if (previewData?.strategyId) {
          existingPreviewByStrategy.set(previewData.strategyId, target!.id);
        }
      }
    }

    const newNodes = [...state.nodes];
    const newEdges = [...state.edges];
    const nodeIdMap = new Map<string, string>();

    results.forEach((result) => {
      const existingNodeId = existingPreviewByStrategy.get(
        result.strategyId,
      );

      if (existingNodeId) {
        const idx = newNodes.findIndex((n) => n.id === existingNodeId);
        if (idx !== -1) {
          const preferredRef =
            firstRefByStrategy.get(result.strategyId) ?? result.id;
          newNodes[idx] = {
            ...newNodes[idx],
            data: {
              ...newNodes[idx].data,
              refId: preferredRef,
              strategyId: result.strategyId,
            },
          };
        }
        const edgeIdx = newEdges.findIndex(
          (e) => e.source === hypothesisNodeId && e.target === existingNodeId,
        );
        if (edgeIdx !== -1) {
          newEdges[edgeIdx] = {
            ...newEdges[edgeIdx],
            data: { status: EDGE_STATUS.PROCESSING },
          };
        }
        nodeIdMap.set(result.strategyId, existingNodeId);
      } else {
        const nodeId = `preview-${generateId()}`;
        newNodes.push({
          id: nodeId,
          type: 'preview',
          position: snap({
            x: col.preview,
            y: hypothesisNode?.position.y ?? 300,
          }),
          data: {
            refId: firstRefByStrategy.get(result.strategyId) ?? result.id,
            strategyId: result.strategyId,
          },
        });

        newEdges.push({
          id: buildEdgeId(hypothesisNodeId, nodeId),
          source: hypothesisNodeId,
          target: nodeId,
          type: EDGE_TYPES.DATA_FLOW,
          data: { status: EDGE_STATUS.PROCESSING },
        });
        nodeIdMap.set(result.strategyId, nodeId);
      }
    });

    set({ nodes: newNodes, edges: newEdges, previewNodeIdMap: nodeIdMap });

    syncVariantSlotsAfterGenerate(hypothesisNodeId, results, nodeIdMap);

    if (get().autoLayout) get().applyAutoLayout();
  },

  forkHypothesisPreviews: (hypothesisNodeId) => {
    const state = get();
    const genState = useGenerationStore.getState();

    const previewNodeIds: string[] = [];
    for (const e of state.edges) {
      if (e.source === hypothesisNodeId) {
        const target = state.nodes.find(
          (n) => n.id === e.target && n.type === 'preview',
        );
        if (target) previewNodeIds.push(target.id);
      }
    }

    if (previewNodeIds.length === 0) return;

    const previewIdSet = new Set(previewNodeIds);

    const newNodes = state.nodes.map((n) => {
      if (!previewIdSet.has(n.id)) return n;
      const vsId = getPreviewNodeData(n)?.strategyId;
      if (!vsId) return n;

      const stack = genState.results
        .filter((r) => r.strategyId === vsId)
        .sort((a, b) => b.runNumber - a.runNumber);
      const selectedId = genState.selectedVersions[vsId];
      const active = selectedId
        ? stack.find((r) => r.id === selectedId)
        : stack.find((r) => r.status === GENERATION_STATUS.COMPLETE) ?? stack[0];

      return {
        ...n,
        position: { x: n.position.x, y: n.position.y + FORK_HYPOTHESIS_PREVIEW_STACK_OFFSET_PX },
        data: {
          ...n.data,
          pinnedRunId: active?.runId ?? UNKNOWN_PINNED_RUN_ID,
        },
      };
    });

    const newEdges = state.edges.filter(
      (e) => !(e.source === hypothesisNodeId && previewIdSet.has(e.target)),
    );

    set({ nodes: newNodes, edges: newEdges });

    syncVariantSlotsAfterFork(hypothesisNodeId, newNodes, previewIdSet);
  },
});
