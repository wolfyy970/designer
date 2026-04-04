import type { StateCreator } from 'zustand';
import type { SectionGhostTargetType } from '../../types/canvas-data';
import {
  getDesignSystemNodeData,
  getHypothesisNodeData,
  getModelNodeData,
} from '../../lib/canvas-node-data';
import type { DesignSpec } from '../../types/spec';
import {
  NODE_TYPE_TO_SECTION,
  type CanvasNodeType,
  type WorkspaceEdge,
  type WorkspaceNode,
} from '../../types/workspace-graph';
import {
  applyWorkspaceEdgeChanges,
  applyWorkspaceNodeChanges,
} from '../../workspace/reactflow-adapter';
import { useCompilerStore } from '../compiler-store';
import { useSpecStore } from '../spec-store';
import { generateId, now } from '../../lib/utils';
import {
  columnX,
  computeAdjacentPosition,
  computeDefaultPosition,
  reconcileSectionGhostNodes,
  OPTIONAL_SECTION_SLOTS,
  SECTION_GHOST_ID_PREFIX,
  snap,
  SECTION_NODE_TYPES,
} from '../../lib/canvas-layout';
import {
  isValidConnection as checkValidConnection,
  buildAutoConnectEdges,
  buildModelEdgeForNode,
  findMissingPrerequisite,
} from '../../lib/canvas-connections';
import { buildEdgeId, EDGE_TYPES, EDGE_STATUS } from '../../constants/canvas';
import { getHypothesisRefId } from '../../lib/hypothesis-node-utils';
import { PREREQUISITE_DEFAULTS } from '../../lib/constants';
import { useWorkspaceDomainStore } from '../workspace-domain-store';
import {
  syncDomainForNewEdge,
  syncDomainForRemovedEdge,
  syncDomainForRemovedNode,
} from '../../workspace/domain-commands';
import {
  scheduleDebouncedAutoLayout,
  shouldScheduleAutoLayoutOnDimensionChange,
} from '../canvas/dimension-layout-debounce';
import { optionalSectionSlotsWithSpecMaterial } from '../../lib/spec-materialize-sections';
import { hydrateDomainFromCanvasGraph } from '../workspace-domain-store';
import type { CanvasStore } from './canvas-store-types';

export const createGraphSlice: StateCreator<
  CanvasStore,
  [],
  [],
  Pick<
    CanvasStore,
    | 'onNodesChange'
    | 'onEdgesChange'
    | 'isValidConnection'
    | 'onConnect'
    | 'addNode'
    | 'materializeOptionalSectionNodesFromSpec'
    | 'removeNode'
    | 'removeEdge'
    | 'updateNodeData'
    | 'disconnectOutputs'
    | 'dismissSectionGhostSlot'
  >
> = (set, get) => ({
  onNodesChange: (changes) => {
    const filtered = changes.filter((ch) => {
      if (ch.type !== 'remove') return true;
      const id = 'id' in ch ? (ch.id as string) : '';
      return !id.startsWith(SECTION_GHOST_ID_PREFIX);
    });
    set({ nodes: applyWorkspaceNodeChanges(filtered, get().nodes) });
    if (shouldScheduleAutoLayoutOnDimensionChange(get().autoLayout, filtered)) {
      scheduleDebouncedAutoLayout(get);
    }
  },

  onEdgesChange: (changes) => {
    const prev = get().edges;
    const next = applyWorkspaceEdgeChanges(changes, prev);
    const nextIds = new Set(next.map((e) => e.id));
    const removed = prev.filter((e) => !nextIds.has(e.id));
    const nodes = get().nodes;
    for (const e of removed) {
      syncDomainForRemovedEdge(e, nodes);
    }
    set({ edges: next });
  },

  isValidConnection: (connection) => {
    const { nodes } = get();
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;
    if (sourceNode.type === 'sectionGhost' || targetNode.type === 'sectionGhost') {
      return false;
    }
    return checkValidConnection(sourceNode.type ?? '', targetNode.type ?? '');
  },

  dismissSectionGhostSlot: (targetType: SectionGhostTargetType) => {
    const current = get().dismissedSectionGhostSlots;
    if (current.includes(targetType)) return;
    const dismissedSectionGhostSlots = [...current, targetType];
    set({
      dismissedSectionGhostSlots,
      sectionGhostToolbarNudge: true,
      nodes: reconcileSectionGhostNodes(get().nodes, dismissedSectionGhostSlots),
    });
    if (get().autoLayout) get().applyAutoLayout();
  },

  onConnect: (connection) => {
    if (!get().isValidConnection(connection)) return;
    const edgeId = buildEdgeId(connection.source!, connection.target!);
    if (get().edges.some((e) => e.id === edgeId)) return;
    const newEdge: WorkspaceEdge = {
      id: edgeId,
      source: connection.source!,
      target: connection.target!,
      type: EDGE_TYPES.DATA_FLOW,
      data: { status: EDGE_STATUS.IDLE },
    };
    const edges = [...get().edges, newEdge];
    set({ edges });
    syncDomainForNewEdge(newEdge, get().nodes, edges);
  },

  addNode: (type, position) => {
    const state = get();

    if (SECTION_NODE_TYPES.has(type) && state.nodes.some((n) => n.type === type)) return;
    if (type === 'hypothesis' && !state.nodes.some((n) => n.type === 'compiler')) return;

    const dismissedSectionGhostSlots = (OPTIONAL_SECTION_SLOTS as readonly string[]).includes(type)
      ? state.dismissedSectionGhostSlots.filter((s) => s !== type)
      : state.dismissedSectionGhostSlots;

    const id = `${type}-${generateId()}`;
    const col = columnX(state.colGap);
    const targetPos = snap(position ?? computeDefaultPosition(type, state.nodes, col));

    const newNode: WorkspaceNode = {
      id,
      type,
      position: targetPos,
      data: { ...PREREQUISITE_DEFAULTS[type] },
    };

    let intermediateNodes = state.nodes;
    const prereqType = findMissingPrerequisite(type, state.nodes);
    if (prereqType) {
      const prereqId = `${prereqType}-${generateId()}`;
      const prereqNode: WorkspaceNode = {
        id: prereqId,
        type: prereqType as CanvasNodeType,
        position: computeAdjacentPosition(targetPos, state.colGap),
        data: PREREQUISITE_DEFAULTS[prereqType] ?? {},
      };
      intermediateNodes = [...intermediateNodes, prereqNode];
    }

    if (type === 'hypothesis') {
      const compilerStore = useCompilerStore.getState();
      const compilerNodes = state.nodes.filter((n) => n.type === 'compiler');
      const targetCompilerId = compilerNodes[0]?.id ?? 'manual';

      if (!compilerStore.dimensionMaps[targetCompilerId]) {
        const spec = useSpecStore.getState().spec;
        compilerStore.setDimensionMapForNode(targetCompilerId, {
          id: generateId(),
          specId: spec.id,
          dimensions: [],
          variants: [],
          generatedAt: now(),
          compilerModel: 'manual',
        });
      }
      compilerStore.addVariantToNode(targetCompilerId);
      const map = compilerStore.dimensionMaps[targetCompilerId];
      const lastVariant = map?.variants[map.variants.length - 1];
      if (lastVariant) {
        newNode.data = { ...newNode.data, refId: lastVariant.id };
        useWorkspaceDomainStore
          .getState()
          .linkHypothesisToIncubator(id, targetCompilerId, lastVariant.id);
      }
    }

    const structuralEdges = buildAutoConnectEdges(id, type, intermediateNodes);
    const modelEdges = buildModelEdgeForNode(id, type, intermediateNodes);

    set({
      dismissedSectionGhostSlots,
      nodes: reconcileSectionGhostNodes(
        [...intermediateNodes, newNode],
        dismissedSectionGhostSlots,
      ),
      edges: [...state.edges, ...structuralEdges, ...modelEdges],
    });
    if (get().autoLayout) get().applyAutoLayout();
  },

  materializeOptionalSectionNodesFromSpec: (spec: DesignSpec) => {
    for (const slot of optionalSectionSlotsWithSpecMaterial(spec)) {
      if (get().nodes.some((n) => n.type === slot)) continue;
      get().addNode(slot);
    }
    const nodes = get().nodes;
    const edges = get().edges;
    hydrateDomainFromCanvasGraph({
      nodes: nodes as { id: string; type: CanvasNodeType; data: Record<string, unknown> }[],
      edges,
    });
    if (get().autoLayout) get().applyAutoLayout();
  },

  removeNode: (nodeId) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.type === 'sectionGhost') return;

    const removedType = node.type as CanvasNodeType;
    if (SECTION_NODE_TYPES.has(removedType)) {
      const sectionId = NODE_TYPE_TO_SECTION[removedType];
      if (sectionId) {
        useSpecStore.getState().resetSectionContent(sectionId);
      }
    }

    syncDomainForRemovedNode(node);

    if (node.type === 'compiler') {
      useCompilerStore.getState().removeDimensionMapForNode(nodeId);
    }

    const removeIds = new Set<string>([nodeId]);
    if (node.type === 'hypothesis') {
      const refId = getHypothesisRefId(node);
      if (refId) useCompilerStore.getState().removeVariant(refId);
      for (const e of state.edges) {
        if (e.source !== nodeId) continue;
        const target = state.nodes.find((n) => n.id === e.target && n.type === 'variant');
        if (target) removeIds.add(target.id);
      }
    }

    const inspectorId = get().runInspectorVariantNodeId;
    const expandedId = get().expandedVariantId;
    const clearInspector =
      inspectorId != null && [...removeIds].some((rid) => rid === inspectorId);
    const clearExpanded =
      expandedId != null && [...removeIds].some((rid) => rid === expandedId);
    const nextVariantMap = new Map(get().variantNodeIdMap);
    for (const [k, v] of nextVariantMap) {
      if (removeIds.has(v)) nextVariantMap.delete(k);
    }
    set({
      nodes: reconcileSectionGhostNodes(
        state.nodes.filter((n) => !removeIds.has(n.id)),
        state.dismissedSectionGhostSlots,
      ),
      edges: state.edges.filter(
        (e) => !removeIds.has(e.source) && !removeIds.has(e.target),
      ),
      variantNodeIdMap: nextVariantMap,
      ...(clearInspector ? { runInspectorVariantNodeId: null as string | null } : {}),
      ...(clearExpanded ? { expandedVariantId: null as string | null } : {}),
    });
    if (get().autoLayout) get().applyAutoLayout();
  },

  removeEdge: (edgeId) => {
    set({ edges: get().edges.filter((e) => e.id !== edgeId) });
  },

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    });
    const n = get().nodes.find((x) => x.id === nodeId);
    if (!n) return;
    const dom = useWorkspaceDomainStore.getState();
    const merged = { ...n.data, ...data };
    const mergedNode = { ...n, data: merged } as WorkspaceNode;
    if (n.type === 'hypothesis') {
      if ('agentMode' in data) {
        const h = getHypothesisNodeData(mergedNode);
        if (h?.agentMode != null) {
          dom.setHypothesisGenerationSettings(nodeId, { agentMode: h.agentMode });
        }
      }
    }
    if (n.type === 'model') {
      const m = getModelNodeData(mergedNode);
      if (m) {
        dom.upsertModelProfile(nodeId, {
          providerId: m.providerId,
          modelId: m.modelId,
          title: m.title,
          thinkingLevel: m.thinkingLevel ?? 'minimal',
        });
      }
    }
    if (n.type === 'designSystem') {
      const ds = getDesignSystemNodeData(mergedNode);
      if (ds) {
        dom.upsertDesignSystem(nodeId, {
          title: ds.title ?? '',
          content: ds.content ?? '',
          images: ds.images ?? [],
          providerMigration: ds.providerId,
          modelMigration: ds.modelId,
        });
      }
    }
  },

  disconnectOutputs: (nodeId) => {
    set({
      edges: get().edges.filter((e) => e.source !== nodeId),
    });
  },
});
