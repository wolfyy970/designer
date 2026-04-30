import { EDGE_STATUS, EDGE_TYPES, INPUT_NODE_TYPES, NODE_TYPES, buildEdgeId } from '../constants/canvas';
import { getHypothesisNodeData } from '../lib/canvas-node-data';
import { getHypothesisRefId, isPlaceholderHypothesis } from '../lib/hypothesis-node-utils';
import type { WorkspaceDomainStore } from '../stores/workspace-domain-store-types';
import type { CanvasNodeType, WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';
import { findIncubatorForHypothesis, snapshotNodeToWorkspace } from './graph-queries';

type NodeType = Exclude<CanvasNodeType, 'inputGhost'>;

type MinimalNode = { id: string; type?: string };
type MinimalEdge = { source: string; target: string };
export type AutoConnectMode = 'new-source-to-sole-target' | 'existing-sources-to-first-target' | 'new-source-to-all-targets' | 'all-sources-to-new-target';

export interface AutoEdge {
  id: string;
  source: string;
  target: string;
  type: typeof EDGE_TYPES.DATA_FLOW;
  data: { status: typeof EDGE_STATUS.IDLE };
}

export type HydrateGraphSnapshot = {
  nodes: { id: string; type: CanvasNodeType; data: Record<string, unknown> }[];
  edges: { source: string; target: string }[];
};

export type IncrementalNewEdgeContext = {
  d: WorkspaceDomainStore;
  src: WorkspaceNode;
  tgt: WorkspaceNode;
  nodes: WorkspaceNode[];
  allEdges: WorkspaceEdge[];
};

export type IncrementalRemovedEdgeContext = {
  d: WorkspaceDomainStore;
  src: WorkspaceNode;
  tgt: WorkspaceNode;
};

export type HydrateEdgeContext = {
  store: WorkspaceDomainStore;
  input: HydrateGraphSnapshot;
  src: HydrateGraphSnapshot['nodes'][number];
  tgt: HydrateGraphSnapshot['nodes'][number];
};

export interface EdgeDomainRule {
  readonly id: string;
  readonly match: (srcType: CanvasNodeType, tgtType: CanvasNodeType) => boolean;
  readonly onAdd?: (ctx: IncrementalNewEdgeContext) => void;
  readonly onRemove?: (ctx: IncrementalRemovedEdgeContext) => void;
  readonly onHydrate?: (ctx: HydrateEdgeContext) => void;
}

interface CanvasEdgeContract extends EdgeDomainRule {
  readonly sourceTypes: readonly NodeType[];
  readonly targetTypes: readonly NodeType[];
  readonly manual: boolean;
  readonly structuralAutoConnect?: readonly AutoConnectMode[];
  readonly paletteModelTarget?: boolean;
}

function makeEdge(source: string, target: string): AutoEdge {
  return { id: buildEdgeId(source, target), source, target, type: EDGE_TYPES.DATA_FLOW, data: { status: EDGE_STATUS.IDLE } };
}

function hasType(node: MinimalNode, types: readonly NodeType[]): boolean {
  return types.includes(node.type as NodeType);
}

function makeContract(input: Omit<CanvasEdgeContract, 'match'>): CanvasEdgeContract {
  return {
    ...input,
    match: (sourceType, targetType) =>
      input.sourceTypes.includes(sourceType as NodeType) && input.targetTypes.includes(targetType as NodeType),
  };
}

const INPUT_TYPES = Array.from(INPUT_NODE_TYPES) as NodeType[];

export const CANVAS_EDGE_CONTRACTS: readonly CanvasEdgeContract[] = [
  makeContract({
    id: 'section-compiler',
    sourceTypes: INPUT_TYPES,
    targetTypes: [NODE_TYPES.INCUBATOR],
    manual: true,
    structuralAutoConnect: ['new-source-to-sole-target', 'existing-sources-to-first-target'],
    onAdd: ({ d, src, tgt }) => {
      d.ensureIncubatorWiring(tgt.id);
      d.attachIncubatorInput(tgt.id, src.id, src.type);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachIncubatorInput(tgt.id, src.id, src.type);
    },
    onHydrate: ({ store, src, tgt }) => {
      store.ensureIncubatorWiring(tgt.id);
      store.attachIncubatorInput(tgt.id, src.id, src.type);
    },
  }),
  makeContract({
    id: 'designSystem-compiler',
    sourceTypes: [NODE_TYPES.DESIGN_SYSTEM],
    targetTypes: [NODE_TYPES.INCUBATOR],
    manual: true,
    structuralAutoConnect: ['new-source-to-sole-target'],
    onAdd: ({ d, src, tgt }) => {
      d.ensureIncubatorWiring(tgt.id);
      d.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.DESIGN_SYSTEM);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachIncubatorInput(tgt.id, src.id, NODE_TYPES.DESIGN_SYSTEM);
    },
    onHydrate: ({ store, src, tgt }) => {
      store.ensureIncubatorWiring(tgt.id);
      store.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.DESIGN_SYSTEM);
    },
  }),
  makeContract({
    id: 'designSystem-hypothesis',
    sourceTypes: [NODE_TYPES.DESIGN_SYSTEM],
    targetTypes: [NODE_TYPES.HYPOTHESIS],
    manual: true,
    structuralAutoConnect: ['new-source-to-all-targets', 'all-sources-to-new-target'],
    onAdd: ({ d, src, tgt, nodes, allEdges }) => {
      d.attachDesignSystemToHypothesis(src.id, tgt.id);
      const refId = getHypothesisRefId(tgt);
      const inc = findIncubatorForHypothesis({ nodes, edges: allEdges }, tgt.id);
      if (refId && inc) d.linkHypothesisToIncubator(tgt.id, inc, refId);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachDesignSystemFromHypothesis(src.id, tgt.id);
    },
    onHydrate: ({ store, input, src, tgt }) => {
      store.attachDesignSystemToHypothesis(src.id, tgt.id);
      const h = getHypothesisNodeData(snapshotNodeToWorkspace(tgt));
      if (h?.refId) {
        const inc = findIncubatorForHypothesis(input, tgt.id);
        if (inc) store.linkHypothesisToIncubator(tgt.id, inc, h.refId);
      }
    },
  }),
  makeContract({
    id: 'model-compiler',
    sourceTypes: [NODE_TYPES.MODEL],
    targetTypes: [NODE_TYPES.INCUBATOR],
    manual: true,
    paletteModelTarget: true,
    onAdd: ({ d, src, tgt }) => {
      d.ensureIncubatorWiring(tgt.id);
      d.attachModelToTarget(src.id, tgt.id, NODE_TYPES.INCUBATOR);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachModelFromTarget(src.id, tgt.id, NODE_TYPES.INCUBATOR);
    },
    onHydrate: ({ store, src, tgt }) => {
      store.ensureIncubatorWiring(tgt.id);
      store.attachModelToTarget(src.id, tgt.id, NODE_TYPES.INCUBATOR);
    },
  }),
  makeContract({
    id: 'model-hypothesis',
    sourceTypes: [NODE_TYPES.MODEL],
    targetTypes: [NODE_TYPES.HYPOTHESIS],
    manual: true,
    paletteModelTarget: true,
    onAdd: ({ d, src, tgt, nodes, allEdges }) => {
      const refId = getHypothesisRefId(tgt);
      const inc = findIncubatorForHypothesis({ nodes, edges: allEdges }, tgt.id);
      if (refId && inc) d.linkHypothesisToIncubator(tgt.id, inc, refId);
      d.setHypothesisPlaceholder(tgt.id, isPlaceholderHypothesis(tgt.data));
      d.attachModelToTarget(src.id, tgt.id, NODE_TYPES.HYPOTHESIS);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachModelFromTarget(src.id, tgt.id, NODE_TYPES.HYPOTHESIS);
    },
    onHydrate: ({ store, input, src, tgt }) => {
      store.attachModelToTarget(src.id, tgt.id, NODE_TYPES.HYPOTHESIS);
      const h = getHypothesisNodeData(snapshotNodeToWorkspace(tgt));
      if (h?.refId) {
        const inc = findIncubatorForHypothesis(input, tgt.id);
        if (inc) store.linkHypothesisToIncubator(tgt.id, inc, h.refId);
      }
    },
  }),
  makeContract({
    id: 'model-designSystem',
    sourceTypes: [NODE_TYPES.MODEL],
    targetTypes: [NODE_TYPES.DESIGN_SYSTEM],
    manual: true,
  }),
  makeContract({
    id: 'compiler-hypothesis',
    sourceTypes: [NODE_TYPES.INCUBATOR],
    targetTypes: [NODE_TYPES.HYPOTHESIS],
    manual: true,
    structuralAutoConnect: ['all-sources-to-new-target'],
    onAdd: ({ d, src, tgt }) => {
      const refId = getHypothesisRefId(tgt);
      if (refId) d.linkHypothesisToIncubator(tgt.id, src.id, refId);
      d.setHypothesisPlaceholder(tgt.id, isPlaceholderHypothesis(tgt.data));
    },
    onHydrate: ({ store, src, tgt }) => {
      const h = getHypothesisNodeData(snapshotNodeToWorkspace(tgt));
      if (h?.refId) {
        store.linkHypothesisToIncubator(tgt.id, src.id, h.refId);
      }
      store.setHypothesisPlaceholder(tgt.id, Boolean(h?.placeholder));
    },
  }),
  makeContract({
    id: 'hypothesis-preview',
    sourceTypes: [NODE_TYPES.HYPOTHESIS],
    targetTypes: [NODE_TYPES.PREVIEW],
    manual: true,
  }),
  makeContract({
    id: 'variant-compiler',
    sourceTypes: [NODE_TYPES.PREVIEW],
    targetTypes: [NODE_TYPES.INCUBATOR],
    manual: true,
    onAdd: ({ d, src, tgt }) => {
      d.ensureIncubatorWiring(tgt.id);
      d.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.PREVIEW);
    },
    onRemove: ({ d, src, tgt }) => {
      d.detachIncubatorInput(tgt.id, src.id, NODE_TYPES.PREVIEW);
    },
    onHydrate: ({ store, src, tgt }) => {
      store.ensureIncubatorWiring(tgt.id);
      store.attachIncubatorInput(tgt.id, src.id, NODE_TYPES.PREVIEW);
    },
  }),
];

export const EDGE_DOMAIN_RULES: readonly EdgeDomainRule[] = CANVAS_EDGE_CONTRACTS.filter(
  (contract) => contract.onAdd || contract.onRemove || contract.onHydrate,
);

export function buildValidConnectionMap(): Record<NodeType, Set<NodeType>> {
  const map = Object.fromEntries(
    Array.from(new Set(CANVAS_EDGE_CONTRACTS.flatMap((contract) => contract.sourceTypes))).map((type) => [
      type,
      new Set<NodeType>(),
    ]),
  ) as Record<NodeType, Set<NodeType>>;
  for (const contract of CANVAS_EDGE_CONTRACTS) {
    if (!contract.manual) continue;
    for (const sourceType of contract.sourceTypes) {
      map[sourceType] ??= new Set<NodeType>();
      for (const targetType of contract.targetTypes) {
        map[sourceType].add(targetType);
      }
    }
  }
  return map;
}

export function findMissingPrerequisiteFromContracts(
  newNodeType: string,
  existingNodes: MinimalNode[],
): string | null {
  const requiresModel = CANVAS_EDGE_CONTRACTS.some(
    (contract) => contract.paletteModelTarget && contract.targetTypes.includes(newNodeType as NodeType),
  );
  if (!requiresModel) return null;
  if (existingNodes.some((node) => node.type === NODE_TYPES.MODEL)) return null;
  return NODE_TYPES.MODEL;
}

export function buildStructuralAutoConnectEdges(
  newNodeId: string,
  type: string,
  existingNodes: MinimalNode[],
): AutoEdge[] {
  const edges: AutoEdge[] = [];
  const nodeType = type as NodeType;

  for (const contract of CANVAS_EDGE_CONTRACTS) {
    const modes = contract.structuralAutoConnect;
    if (!modes?.length) continue;

    if (modes.includes('new-source-to-sole-target') && contract.sourceTypes.includes(nodeType)) {
      const targets = existingNodes.filter((node) => hasType(node, contract.targetTypes));
      if (targets.length === 1) edges.push(makeEdge(newNodeId, targets[0].id));
    }

    if (modes.includes('existing-sources-to-first-target') && contract.targetTypes.includes(nodeType)) {
      const existingTargets = existingNodes.filter((node) => hasType(node, contract.targetTypes));
      if (existingTargets.length === 0) {
        for (const source of existingNodes.filter((node) => hasType(node, contract.sourceTypes))) {
          edges.push(makeEdge(source.id, newNodeId));
        }
      }
    }

    if (modes.includes('new-source-to-all-targets') && contract.sourceTypes.includes(nodeType)) {
      for (const target of existingNodes.filter((node) => hasType(node, contract.targetTypes))) {
        edges.push(makeEdge(newNodeId, target.id));
      }
    }

    if (modes.includes('all-sources-to-new-target') && contract.targetTypes.includes(nodeType)) {
      const sources = existingNodes.filter((node) => hasType(node, contract.sourceTypes));
      if (contract.sourceTypes.includes(NODE_TYPES.INCUBATOR)) {
        if (sources.length === 1) edges.push(makeEdge(sources[0].id, newNodeId));
      } else {
        for (const source of sources) edges.push(makeEdge(source.id, newNodeId));
      }
    }
  }

  return edges;
}

export function buildPaletteModelEdgesForNode(
  nodeId: string,
  nodeType: string,
  existingNodes: MinimalNode[],
): AutoEdge[] {
  const needsModel = CANVAS_EDGE_CONTRACTS.some(
    (contract) =>
      contract.paletteModelTarget
      && contract.sourceTypes.includes(NODE_TYPES.MODEL)
      && contract.targetTypes.includes(nodeType as NodeType),
  );
  if (!needsModel) return [];

  const model = existingNodes.find((node) => node.type === NODE_TYPES.MODEL);
  return model ? [makeEdge(model.id, nodeId)] : [];
}

function findModelsConnectedTo(
  parentId: string,
  nodes: MinimalNode[],
  edges: MinimalEdge[],
): MinimalNode[] {
  const modelIds = new Set<string>();
  for (const edge of edges) {
    if (edge.target === parentId) {
      const source = nodes.find((node) => node.id === edge.source);
      if (source?.type === NODE_TYPES.MODEL) modelIds.add(source.id);
    }
  }
  return nodes.filter((node) => modelIds.has(node.id));
}

export function buildScopedModelEdgesFromParent(
  parentId: string,
  childIds: string[],
  nodes: MinimalNode[],
  edges: MinimalEdge[],
): AutoEdge[] {
  let models = findModelsConnectedTo(parentId, nodes, edges);

  if (models.length === 0) {
    const firstModel = nodes.find((node) => node.type === NODE_TYPES.MODEL);
    if (firstModel) models = [firstModel];
  } else {
    models = [models[0]!];
  }

  return models.flatMap((model) => childIds.map((childId) => makeEdge(model.id, childId)));
}
