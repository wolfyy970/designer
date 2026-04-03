/**
 * Zustand canvas projection: React Flow nodes/edges, layout, persistence.
 * Debounced dimension→layout timing lives in `./canvas/dimension-layout-debounce.ts`;
 * hypothesis vertical stack constants in `./canvas/hypothesis-layout-constants.ts`.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VariantStrategy } from '../types/compiler';
import type { GenerationResult } from '../types/provider';
import type {
  CritiqueNodeData,
  DesignSystemNodeData,
  HypothesisNodeData,
  ModelNodeData,
  VariantNodeData,
} from '../types/canvas-data';
import type { Connection } from '../workspace/reactflow-adapter';
import {
  applyWorkspaceEdgeChanges,
  applyWorkspaceNodeChanges,
} from '../workspace/reactflow-adapter';
import {
  type CanvasNodeData,
  type CanvasNodeType,
  type WorkspaceEdge,
  type WorkspaceNode,
  type WorkspaceViewport,
} from '../types/workspace-graph';
import { useCompilerStore } from './compiler-store';
import { useGenerationStore } from './generation-store';
import { useSpecStore } from './spec-store';
import { generateId, now } from '../lib/utils';
import {
  computeAutoLayout,
  computeDefaultPosition,
  columnX,
  snap,
  DEFAULT_COL_GAP,
  MIN_COL_GAP,
  MAX_COL_GAP,
  SECTION_NODE_TYPES,
  computeAdjacentPosition,
} from '../lib/canvas-layout';
import { isValidConnection as checkValidConnection, buildAutoConnectEdges, buildModelEdgeForNode, buildModelEdgesFromParent, findMissingPrerequisite } from '../lib/canvas-connections';
import { buildEdgeId, EDGE_TYPES, EDGE_STATUS, type EdgeStatus } from '../constants/canvas';
import { computeLineage } from '../lib/canvas-graph';
import { getHypothesisRefId } from '../lib/hypothesis-node-utils';
import { STORAGE_KEYS } from '../lib/storage-keys';
import { PREREQUISITE_DEFAULTS } from '../lib/constants';
import { migrateCanvasState } from './canvas-migrations';
import { hydrateDomainFromCanvasGraph, useWorkspaceDomainStore } from './workspace-domain-store';
import {
  linkHypothesesAfterCompile,
  syncDomainForNewEdge,
  syncDomainForRemovedEdge,
  syncDomainForRemovedNode,
} from '../workspace/domain-commands';
import {
  scheduleDebouncedAutoLayout,
  shouldScheduleAutoLayoutOnDimensionChange,
} from './canvas/dimension-layout-debounce';
import {
  HYPOTHESIS_STACK_GAP,
  HYPOTHESIS_STACK_NODE_H,
  HYPOTHESIS_STACK_SPACING,
} from './canvas/hypothesis-layout-constants';

// Re-export for consumers
export { GRID_SIZE, SECTION_NODE_TYPES } from '../lib/canvas-layout';
export type { CanvasNodeData, CanvasNodeType } from '../types/workspace-graph';
export { NODE_TYPE_TO_SECTION } from '../types/workspace-graph';
export type { EdgeStatus } from '../constants/canvas';

// ── Store interface ─────────────────────────────────────────────────

interface CanvasStore {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  viewport: WorkspaceViewport;

  showMiniMap: boolean;
  showGrid: boolean;
  colGap: number;
  autoLayout: boolean;
  // Non-persisted UI state
  expandedVariantId: string | null;
  /** Right drawer: variant canvas node id whose run workspace is open */
  runInspectorVariantNodeId: string | null;
  lineageNodeIds: Set<string>;
  lineageEdgeIds: Set<string>;
  /** Transient map: variantStrategyId → canvas nodeId (for edge status callbacks during generation) */
  variantNodeIdMap: Map<string, string>;
  /** Transient: which node type + handle type is currently being dragged from (for handle glow) */
  connectingFrom: { nodeType: CanvasNodeType; handleType: 'source' | 'target' } | null;
  /** Transient: React Flow layer should fitView after default template nodes are created (not persisted). */
  pendingFitViewAfterTemplate: boolean;
  consumePendingFitView: () => void;

  onNodesChange: (changes: Parameters<typeof applyWorkspaceNodeChanges>[0]) => void;
  onEdgesChange: (changes: Parameters<typeof applyWorkspaceEdgeChanges>[0]) => void;
  setViewport: (viewport: WorkspaceViewport) => void;

  toggleMiniMap: () => void;
  toggleGrid: () => void;
  setColGap: (gap: number) => void;
  toggleAutoLayout: () => void;

  addNode: (type: CanvasNodeType, position?: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  updateNodeData: (nodeId: string, data: Partial<CanvasNodeData>) => void;
  disconnectOutputs: (nodeId: string) => void;
  onConnect: (connection: Connection) => void;
  isValidConnection: (connection: Connection | Pick<WorkspaceEdge, 'source' | 'target'>) => boolean;

  setExpandedVariant: (id: string | null) => void;
  setRunInspectorVariant: (variantNodeId: string | null) => void;
  closeRunInspector: () => void;
  computeLineage: (selectedNodeId: string | null) => void;

  addPlaceholderHypotheses: (compilerNodeId: string, count: number) => string[];
  removePlaceholders: (placeholderIds: string[]) => void;
  initializeCanvas: () => void;
  syncAfterCompile: (newVariants: VariantStrategy[], compilerNodeId: string) => void;
  syncAfterGenerate: (results: GenerationResult[], hypothesisNodeId: string) => void;
  forkHypothesisVariants: (hypothesisNodeId: string) => void;
  clearVariantNodeIdMap: () => void;
  setConnectingFrom: (from: CanvasStore['connectingFrom']) => void;
  setEdgeStatusBySource: (sourceId: string, status: EdgeStatus) => void;
  setEdgeStatusByTarget: (targetId: string, status: EdgeStatus) => void;

  applyAutoLayout: () => void;
  resetCanvas: () => void;
  reset: () => void;
}

// ── Store implementation ────────────────────────────────────────────

export const useCanvasStore = create<CanvasStore>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 0.85 },

      showMiniMap: true,
      showGrid: true,
      colGap: DEFAULT_COL_GAP,
      autoLayout: true,
      // Non-persisted UI state
      expandedVariantId: null,
      runInspectorVariantNodeId: null,
      lineageNodeIds: new Set<string>(),
      lineageEdgeIds: new Set<string>(),
      variantNodeIdMap: new Map<string, string>(),
      connectingFrom: null,
      pendingFitViewAfterTemplate: false,

      consumePendingFitView: () => set({ pendingFitViewAfterTemplate: false }),

      onNodesChange: (changes) => {
        set({ nodes: applyWorkspaceNodeChanges(changes, get().nodes) });
        if (shouldScheduleAutoLayoutOnDimensionChange(get().autoLayout, changes)) {
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

      setViewport: (viewport) => set({ viewport }),

      toggleMiniMap: () => set((s) => ({ showMiniMap: !s.showMiniMap })),
      toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
      setColGap: (gap) => {
        const clamped = Math.max(MIN_COL_GAP, Math.min(MAX_COL_GAP, gap));
        set({ colGap: clamped });
        get().applyAutoLayout();
      },
      toggleAutoLayout: () => {
        const next = !get().autoLayout;
        set({ autoLayout: next });
        if (next) get().applyAutoLayout();
      },

      // ── Connection validation ───────────────────────────────────

      isValidConnection: (connection) => {
        const { nodes } = get();
        const sourceNode = nodes.find((n) => n.id === connection.source);
        const targetNode = nodes.find((n) => n.id === connection.target);
        if (!sourceNode || !targetNode) return false;
        return checkValidConnection(sourceNode.type ?? '', targetNode.type ?? '');
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

      // ── Add node with auto-connect ──────────────────────────────

      addNode: (type, position) => {
        const state = get();

        // Sections are still singletons (one per type)
        if (SECTION_NODE_TYPES.has(type) && state.nodes.some((n) => n.type === type)) return;

        // All nodes get unique IDs
        const id = `${type}-${generateId()}`;
        const col = columnX(state.colGap);
        const targetPos = snap(position ?? computeDefaultPosition(type, state.nodes, col));

        const newNode: WorkspaceNode = {
          id,
          type,
          position: targetPos,
          data: { ...PREREQUISITE_DEFAULTS[type] },
        };

        // Auto-create prerequisite nodes (driven by PREREQUISITE_RULES)
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

        // For manually added hypotheses, create a variant in the compiler store
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

        set({ nodes: [...intermediateNodes, newNode], edges: [...state.edges, ...structuralEdges, ...modelEdges] });
        if (get().autoLayout) get().applyAutoLayout();
      },

      // ── Remove node ────────────────────────────────────────────

      removeNode: (nodeId) => {
        const state = get();
        const node = state.nodes.find((n) => n.id === nodeId);
        if (!node) return;

        syncDomainForRemovedNode(node);

        // If removing a compiler, also clean up its dimension map
        if (node.type === 'compiler') {
          useCompilerStore.getState().removeDimensionMapForNode(nodeId);
        }

        // If removing a hypothesis, cascade-delete its connected variants
        // and remove the strategy from the compiler store
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
        const clearInspector =
          inspectorId != null && [...removeIds].some((rid) => rid === inspectorId);
        set({
          nodes: state.nodes.filter((n) => !removeIds.has(n.id)),
          edges: state.edges.filter(
            (e) => !removeIds.has(e.source) && !removeIds.has(e.target)
          ),
          ...(clearInspector ? { runInspectorVariantNodeId: null as string | null } : {}),
        });
        if (get().autoLayout) get().applyAutoLayout();
      },

      // ── Remove a single edge ────────────────────────────────────

      removeEdge: (edgeId) => {
        set({ edges: get().edges.filter((e) => e.id !== edgeId) });
      },

      // ── Update node data (for critique text, etc.) ───────────────

      updateNodeData: (nodeId, data) => {
        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
          ),
        });
        const n = get().nodes.find((x) => x.id === nodeId);
        if (!n) return;
        const dom = useWorkspaceDomainStore.getState();
        const merged = { ...n.data, ...data };
        if (n.type === 'hypothesis') {
          if ('agentMode' in data) {
            dom.setHypothesisGenerationSettings(nodeId, {
              agentMode: merged.agentMode as HypothesisNodeData['agentMode'],
            });
          }
        }
        if (n.type === 'model') {
          const m = merged as ModelNodeData;
          dom.upsertModelProfile(nodeId, {
            providerId: m.providerId,
            modelId: m.modelId,
            title: m.title,
            thinkingLevel: m.thinkingLevel ?? 'minimal',
          });
        }
        if (n.type === 'designSystem') {
          const ds = merged as DesignSystemNodeData;
          dom.upsertDesignSystem(nodeId, {
            title: ds.title ?? '',
            content: ds.content ?? '',
            images: ds.images ?? [],
            providerMigration: ds.providerId,
            modelMigration: ds.modelId,
          });
        }
        if (n.type === 'critique') {
          const c = merged as CritiqueNodeData;
          dom.upsertCritique(nodeId, {
            title: c.title ?? '',
            strengths: c.strengths ?? '',
            improvements: c.improvements ?? '',
            direction: c.direction ?? '',
          });
        }
      },

      // ── Disconnect outgoing edges from a node ────────────────────

      disconnectOutputs: (nodeId) => {
        set({
          edges: get().edges.filter((e) => e.source !== nodeId),
        });
      },

      // ── Full-screen variant preview ────────────────────────────

      setExpandedVariant: (id) => set({ expandedVariantId: id }),

      setRunInspectorVariant: (variantNodeId: string | null) =>
        set({ runInspectorVariantNodeId: variantNodeId }),

      closeRunInspector: () => set({ runInspectorVariantNodeId: null }),

      // ── Lineage highlighting ───────────────────────────────────

      computeLineage: (selectedNodeId) => {
        if (!selectedNodeId) {
          // Bail out if lineage is already empty — avoids creating new Set
          // references that trigger unnecessary re-renders in every node.
          if (get().lineageNodeIds.size === 0) return;
          set({ lineageNodeIds: new Set(), lineageEdgeIds: new Set() });
          return;
        }

        const { nodeIds, edgeIds } = computeLineage(get().edges, selectedNodeId);

        if (nodeIds.size <= 1) {
          set({ lineageNodeIds: new Set(), lineageEdgeIds: new Set() });
        } else {
          set({ lineageNodeIds: nodeIds, lineageEdgeIds: edgeIds });
        }
      },

      // ── Placeholder hypothesis nodes (skeleton during incubation) ──

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
            position: snap({ x: col.hypothesis, y: maxY + HYPOTHESIS_STACK_GAP + i * (HYPOTHESIS_STACK_NODE_H + HYPOTHESIS_STACK_SPACING) }),
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

      // ── Initialize canvas with template ─────────────────────────

      initializeCanvas: () => {
        const state = get();
        if (state.nodes.length > 0) {
          hydrateDomainFromCanvasGraph({
            nodes: state.nodes as { id: string; type: CanvasNodeType; data: Record<string, unknown> }[],
            edges: state.edges,
          });
          if (get().autoLayout) get().applyAutoLayout();
          return;
        }

        // Template: Design Brief + Model + Incubator (all connected)
        const col = columnX(state.colGap);
        const briefId = `designBrief-${generateId()}`;
        const modelId = `model-${generateId()}`;
        const compilerId = `compiler-${generateId()}`;

        set({
          nodes: [
            {
              id: briefId,
              type: 'designBrief',
              position: snap({ x: col.sections, y: 300 }),
              data: {},
            },
            {
              id: modelId,
              type: 'model',
              position: snap({ x: col.compiler, y: 100 }),
              data: { ...PREREQUISITE_DEFAULTS['model'] },
            },
            {
              id: compilerId,
              type: 'compiler',
              position: snap({ x: col.compiler, y: 400 }),
              data: {},
            },
          ],
          edges: [
            {
              id: buildEdgeId(briefId, compilerId),
              source: briefId,
              target: compilerId,
              type: EDGE_TYPES.DATA_FLOW,
              data: { status: EDGE_STATUS.IDLE },
            },
            {
              id: buildEdgeId(modelId, compilerId),
              source: modelId,
              target: compilerId,
              type: EDGE_TYPES.DATA_FLOW,
              data: { status: EDGE_STATUS.IDLE },
            },
          ],
          pendingFitViewAfterTemplate: true,
        });
        hydrateDomainFromCanvasGraph({
          nodes: get().nodes as { id: string; type: CanvasNodeType; data: Record<string, unknown> }[],
          edges: get().edges,
        });
      },

      // ── Sync after compilation (scoped to a specific compiler) ──

      syncAfterCompile: (newVariants, compilerNodeId) => {
        if (newVariants.length === 0) return;
        const state = get();
        const col = columnX(state.colGap);
        const compilerNode = state.nodes.find((n) => n.id === compilerNodeId);
        const compilerY = compilerNode?.position.y ?? 300;

        // Existing hypothesis node IDs to prevent duplicates
        const existingHypIds = new Set(
          state.nodes.filter((n) => n.type === 'hypothesis').map((n) => n.data.refId),
        );

        // Find bottom-most existing hypothesis Y connected to this compiler
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
            position: snap({ x: col.hypothesis, y: maxY + HYPOTHESIS_STACK_GAP + placed * (HYPOTHESIS_STACK_NODE_H + HYPOTHESIS_STACK_SPACING) }),
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

          // Structural edges only (designSystem→hypothesis)
          const structuralEdges = buildAutoConnectEdges(nodeId, 'hypothesis', addedNodes);
          addedEdges.push(...structuralEdges);
        });

        if (placed === 0) return;

        const newHypothesisIds = compileLinkPairs.map((p) => p.hypothesisNodeId);

        // Propagate the compiler's model to all new hypotheses
        const modelEdges = buildModelEdgesFromParent(
          compilerNodeId, newHypothesisIds, addedNodes, addedEdges,
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

      // ── Sync after generation (scoped to a specific hypothesis) ──
      // Version-stacking: reuse existing variant node. refId uses the first lane
      // for a strategy (multi-model) so it stays tied to an in-flight placeholder
      // until the first lane finishes — avoids stale refId when the last lane completes first.

      syncAfterGenerate: (results, hypothesisNodeId) => {
        const state = get();
        const col = columnX(state.colGap);
        const hypothesisNode = state.nodes.find((n) => n.id === hypothesisNodeId);

        const firstRefByStrategy = new Map<string, string>();
        for (const r of results) {
          if (!firstRefByStrategy.has(r.variantStrategyId)) {
            firstRefByStrategy.set(r.variantStrategyId, r.id);
          }
        }

        // Find existing variant node connected to this hypothesis (for stacking)
        const existingVariantByStrategy = new Map<string, string>(); // vsId → nodeId
        for (const e of state.edges) {
          if (e.source === hypothesisNodeId) {
            const target = state.nodes.find(
              (n) => n.id === e.target && n.type === 'variant',
            );
            if ((target?.data as VariantNodeData | undefined)?.variantStrategyId) {
              existingVariantByStrategy.set(
                (target!.data as VariantNodeData).variantStrategyId!,
                target!.id,
              );
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
            // UPDATE existing variant node — stable refId across multi-lane sync
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
            // Update edge status to processing
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
            // CREATE new variant node with unique ID
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

        const dom = useWorkspaceDomainStore.getState();
        for (const result of results) {
          const variantNodeId = nodeIdMap.get(result.variantStrategyId) ?? null;
          dom.setVariantSlot(hypothesisNodeId, result.variantStrategyId, {
            variantNodeId,
            activeResultId: result.id,
          });
        }

        if (get().autoLayout) get().applyAutoLayout();
      },

      // ── Fork: pin existing variants and disconnect from hypothesis ──

      forkHypothesisVariants: (hypothesisNodeId) => {
        const state = get();
        const genState = useGenerationStore.getState();

        // Find variant nodes connected to this hypothesis
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

        // Pin each variant with its current active result's runId
        const newNodes = state.nodes.map((n) => {
          if (!variantIdSet.has(n.id)) return n;
          const vsId = (n.data as VariantNodeData).variantStrategyId;
          if (!vsId) return n;

          // Find the active result's runId for this variant
          const stack = genState.results
            .filter((r) => r.variantStrategyId === vsId)
            .sort((a, b) => b.runNumber - a.runNumber);
          const selectedId = genState.selectedVersions[vsId];
          const active = selectedId
            ? stack.find((r) => r.id === selectedId)
            : stack.find((r) => r.status === 'complete') ?? stack[0];

          return {
            ...n,
            position: { x: n.position.x, y: n.position.y + 200 },
            data: {
              ...n.data,
              pinnedRunId: active?.runId ?? 'unknown',
            },
          };
        });

        // Remove hypothesis → variant edges
        const newEdges = state.edges.filter(
          (e) => !(e.source === hypothesisNodeId && variantIdSet.has(e.target)),
        );

        set({ nodes: newNodes, edges: newEdges });

        const dom = useWorkspaceDomainStore.getState();
        for (const n of newNodes) {
          if (!variantIdSet.has(n.id)) continue;
          const vsId = (n.data as VariantNodeData).variantStrategyId;
          const pin = (n.data as VariantNodeData).pinnedRunId;
          if (vsId && pin) {
            dom.setVariantSlot(hypothesisNodeId, vsId, { pinnedRunId: pin });
          }
        }
      },

      clearVariantNodeIdMap: () => set({ variantNodeIdMap: new Map() }),
      setConnectingFrom: (from) => set({ connectingFrom: from }),

      // ── Edge status ─────────────────────────────────────────────

      setEdgeStatusBySource: (sourceId, status) =>
        set({
          edges: get().edges.map((e) =>
            e.source === sourceId ? { ...e, data: { status } } : e
          ),
        }),

      setEdgeStatusByTarget: (targetId, status) =>
        set({
          edges: get().edges.map((e) =>
            e.target === targetId ? { ...e, data: { status } } : e
          ),
        }),

      // ── Auto-layout (delegates to pure function) ─────────────────

      applyAutoLayout: () => {
        const { nodes, edges, colGap } = get();
        if (nodes.length === 0) return;
        set({ nodes: computeAutoLayout(nodes, edges, colGap) });
      },

      // ── Reset ───────────────────────────────────────────────────

      resetCanvas: () => {
        set({
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 0.85 },
          expandedVariantId: null,
          runInspectorVariantNodeId: null,
          lineageNodeIds: new Set(),
          lineageEdgeIds: new Set(),
          pendingFitViewAfterTemplate: false,
        });
        get().initializeCanvas();
      },

      reset: () =>
        set({
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 0.85 },
          expandedVariantId: null,
          runInspectorVariantNodeId: null,
          lineageNodeIds: new Set(),
          lineageEdgeIds: new Set(),
          pendingFitViewAfterTemplate: false,
        }),
    }),
    {
      name: STORAGE_KEYS.CANVAS,
      version: 15,
      migrate: (persistedState: unknown, version: number) => {
        // Try to parse the raw state safely to avoid runtime crashes
        // before passing it to the complex migration logic
        try {
          if (typeof persistedState === 'string') {
            return migrateCanvasState(JSON.parse(persistedState), version);
          }
          return migrateCanvasState(persistedState, version);
        } catch (e) {
          console.error("Failed to parse persisted canvas state for migration", e);
          return migrateCanvasState({}, version);
        }
      },
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        showMiniMap: state.showMiniMap,
        showGrid: state.showGrid,
        colGap: state.colGap,
        autoLayout: state.autoLayout,
      }),
    }
  )
);
