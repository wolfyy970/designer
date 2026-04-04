import type { StateCreator } from 'zustand';
import { generateId } from '../../lib/utils';
import { getVariantNodeData } from '../../lib/canvas-node-data';
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
import { FORK_HYPOTHESIS_VARIANT_STACK_OFFSET_PX } from '../../lib/constants';
import { GENERATION_STATUS } from '../../constants/generation';
import { useGenerationStore } from '../generation-store';
import { syncVariantSlotsAfterFork, syncVariantSlotsAfterGenerate } from './canvas-sync-side-effects';
import { linkHypothesesAfterCompile, syncDomainForNewEdge } from '../../workspace/domain-commands';
import {
  HYPOTHESIS_STACK_GAP,
  HYPOTHESIS_STACK_NODE_H,
  HYPOTHESIS_STACK_SPACING,
} from './hypothesis-layout-constants';
import type { CanvasStore } from './canvas-store-types';
import { firstResultIdByVariantStrategy } from './sync-after-generate-helpers';

export const createSyncSlice: StateCreator<
  CanvasStore,
  [],
  [],
  Pick<
    CanvasStore,
    | 'addPlaceholderHypotheses'
    | 'removePlaceholders'
    | 'syncAfterCompile'
    | 'syncAfterGenerate'
    | 'forkHypothesisVariants'
  >
> = (set, get) => ({
  addPlaceholderHypotheses: (compilerNodeId, count) => {
    const state = get();
    const col = columnX(state.colGap);

    let maxY = state.nodes.find((n) => n.id === compilerNodeId)?.position.y ?? 300;
    for (const e of state.edges) {
      if (e.source !== compilerNodeId) continue;
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
        id: buildEdgeId(compilerNodeId, phId),
        source: compilerNodeId,
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

  syncAfterCompile: (newVariants, compilerNodeId) => {
    if (newVariants.length === 0) return;
    const state = get();
    const col = columnX(state.colGap);
    const compilerNode = state.nodes.find((n) => n.id === compilerNodeId);
    const compilerY = compilerNode?.position.y ?? 300;

    const existingHypIds = new Set(
      state.nodes.filter((n) => n.type === 'hypothesis').map((n) => n.data.refId),
    );

    let maxY = compilerY;
    for (const e of state.edges) {
      if (e.source !== compilerNodeId) continue;
      const target = state.nodes.find((n) => n.id === e.target && n.type === 'hypothesis');
      if (target) {
        const bottom = target.position.y + (target.measured?.height ?? 300);
        if (bottom > maxY) maxY = bottom;
      }
    }

    const addedNodes = [...state.nodes];
    const addedEdges = [...state.edges];
    let placed = 0;

    const compileLinkPairs: { hypothesisNodeId: string; variantStrategyId: string }[] = [];

    newVariants.forEach((variant) => {
      if (existingHypIds.has(variant.id)) return;

      const nodeId = `hypothesis-${variant.id}`;
      addedNodes.push({
        id: nodeId,
        type: 'hypothesis',
        position: snap({
          x: col.hypothesis,
          y: maxY + HYPOTHESIS_STACK_GAP + placed * (HYPOTHESIS_STACK_NODE_H + HYPOTHESIS_STACK_SPACING),
        }),
        data: { refId: variant.id },
      });
      placed++;
      compileLinkPairs.push({ hypothesisNodeId: nodeId, variantStrategyId: variant.id });

      addedEdges.push({
        id: buildEdgeId(compilerNodeId, nodeId),
        source: compilerNodeId,
        target: nodeId,
        type: EDGE_TYPES.DATA_FLOW,
        data: { status: EDGE_STATUS.COMPLETE },
      });

      const structuralEdges = buildAutoConnectEdges(nodeId, 'hypothesis', addedNodes);
      addedEdges.push(...structuralEdges);
    });

    if (placed === 0) return;

    const newHypothesisIds = compileLinkPairs.map((p) => p.hypothesisNodeId);

    const modelEdges = buildModelEdgesFromParent(
      compilerNodeId,
      newHypothesisIds,
      addedNodes,
      addedEdges,
    );
    addedEdges.push(...modelEdges);

    set({ nodes: addedNodes, edges: addedEdges });
    linkHypothesesAfterCompile(compilerNodeId, compileLinkPairs);
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

    const firstRefByStrategy = firstResultIdByVariantStrategy(results);

    const existingVariantByStrategy = new Map<string, string>();
    for (const e of state.edges) {
      if (e.source === hypothesisNodeId) {
        const target = state.nodes.find(
          (n) => n.id === e.target && n.type === 'variant',
        );
        const variantData = target ? getVariantNodeData(target) : undefined;
        if (variantData?.variantStrategyId) {
          existingVariantByStrategy.set(variantData.variantStrategyId, target!.id);
        }
      }
    }

    const newNodes = [...state.nodes];
    const newEdges = [...state.edges];
    const nodeIdMap = new Map<string, string>();

    results.forEach((result) => {
      const existingNodeId = existingVariantByStrategy.get(
        result.variantStrategyId,
      );

      if (existingNodeId) {
        const idx = newNodes.findIndex((n) => n.id === existingNodeId);
        if (idx !== -1) {
          const preferredRef =
            firstRefByStrategy.get(result.variantStrategyId) ?? result.id;
          newNodes[idx] = {
            ...newNodes[idx],
            data: {
              ...newNodes[idx].data,
              refId: preferredRef,
              variantStrategyId: result.variantStrategyId,
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
        nodeIdMap.set(result.variantStrategyId, existingNodeId);
      } else {
        const nodeId = `variant-${generateId()}`;
        newNodes.push({
          id: nodeId,
          type: 'variant',
          position: snap({
            x: col.variant,
            y: hypothesisNode?.position.y ?? 300,
          }),
          data: {
            refId: firstRefByStrategy.get(result.variantStrategyId) ?? result.id,
            variantStrategyId: result.variantStrategyId,
          },
        });

        newEdges.push({
          id: buildEdgeId(hypothesisNodeId, nodeId),
          source: hypothesisNodeId,
          target: nodeId,
          type: EDGE_TYPES.DATA_FLOW,
          data: { status: EDGE_STATUS.PROCESSING },
        });
        nodeIdMap.set(result.variantStrategyId, nodeId);
      }
    });

    set({ nodes: newNodes, edges: newEdges, variantNodeIdMap: nodeIdMap });

    syncVariantSlotsAfterGenerate(hypothesisNodeId, results, nodeIdMap);

    if (get().autoLayout) get().applyAutoLayout();
  },

  forkHypothesisVariants: (hypothesisNodeId) => {
    const state = get();
    const genState = useGenerationStore.getState();

    const variantNodeIds: string[] = [];
    for (const e of state.edges) {
      if (e.source === hypothesisNodeId) {
        const target = state.nodes.find(
          (n) => n.id === e.target && n.type === 'variant',
        );
        if (target) variantNodeIds.push(target.id);
      }
    }

    if (variantNodeIds.length === 0) return;

    const variantIdSet = new Set(variantNodeIds);

    const newNodes = state.nodes.map((n) => {
      if (!variantIdSet.has(n.id)) return n;
      const vsId = getVariantNodeData(n)?.variantStrategyId;
      if (!vsId) return n;

      const stack = genState.results
        .filter((r) => r.variantStrategyId === vsId)
        .sort((a, b) => b.runNumber - a.runNumber);
      const selectedId = genState.selectedVersions[vsId];
      const active = selectedId
        ? stack.find((r) => r.id === selectedId)
        : stack.find((r) => r.status === GENERATION_STATUS.COMPLETE) ?? stack[0];

      return {
        ...n,
        position: { x: n.position.x, y: n.position.y + FORK_HYPOTHESIS_VARIANT_STACK_OFFSET_PX },
        data: {
          ...n.data,
          pinnedRunId: active?.runId ?? UNKNOWN_PINNED_RUN_ID,
        },
      };
    });

    const newEdges = state.edges.filter(
      (e) => !(e.source === hypothesisNodeId && variantIdSet.has(e.target)),
    );

    set({ nodes: newNodes, edges: newEdges });

    syncVariantSlotsAfterFork(hypothesisNodeId, newNodes, variantIdSet);
  },
});
