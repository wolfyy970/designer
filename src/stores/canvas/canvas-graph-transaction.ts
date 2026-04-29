import { NODE_TYPES } from '../../constants/canvas';
import { getHypothesisRefId } from '../../lib/hypothesis-node-utils';
import type { WorkspaceEdge, WorkspaceNode } from '../../types/workspace-graph';
import {
  ensureHypothesisStrategyBinding,
  hydrateDomainAfterSpecMaterialize,
  removeCompilerPlanForNode,
  removeCompilerStrategyByRefId,
  resetSpecSectionForRemovedNode,
  syncNodeDataToWorkspaceDomain,
} from '../../workspace/canvas-orchestration';
import {
  syncDomainForNewEdge,
  syncDomainForRemovedEdge,
  syncDomainForRemovedNode,
} from '../../workspace/domain-commands';
import type {
  AddNodePlan,
  ConnectionPlan,
  EdgeRemovalPlan,
  NodeDataUpdatePlan,
  RemoveNodePlan,
} from '../../workspace/canvas-mutation-planner';

type CanvasGraphPatch = {
  nodes?: WorkspaceNode[];
  edges?: WorkspaceEdge[];
  previewNodeIdMap?: Map<string, string>;
  runInspectorPreviewNodeId?: string | null;
  expandedPreviewId?: string | null;
};

type CommitGraphPatch = (patch: CanvasGraphPatch) => void;
type ApplyAutoLayout = () => void;

export function syncRemovedEdgesToDomain(
  removed: readonly WorkspaceEdge[],
  nodes: readonly WorkspaceNode[],
): void {
  for (const edge of removed) {
    syncDomainForRemovedEdge(edge, nodes as WorkspaceNode[]);
  }
}

export function applyEdgeRemovalTransaction(
  plan: EdgeRemovalPlan,
  nodes: readonly WorkspaceNode[],
): void {
  syncRemovedEdgesToDomain(plan.removedEdges, nodes);
}

export function commitEdgeRemovalTransaction(
  plan: EdgeRemovalPlan,
  nodes: readonly WorkspaceNode[],
  commit: CommitGraphPatch,
): void {
  applyEdgeRemovalTransaction(plan, nodes);
  commit({ edges: plan.nextEdges });
}

export function commitEdgeChangesTransaction(
  prevEdges: readonly WorkspaceEdge[],
  nextEdges: WorkspaceEdge[],
  nodes: readonly WorkspaceNode[],
  commit: CommitGraphPatch,
): void {
  const nextIds = new Set(nextEdges.map((edge) => edge.id));
  const removedEdges = prevEdges.filter((edge) => !nextIds.has(edge.id));
  commitEdgeRemovalTransaction({ removedEdges, nextEdges }, nodes, commit);
}

export function finalizeAddNodePlan(plan: AddNodePlan): WorkspaceNode {
  if (!plan.hypothesisBinding) return plan.newNode;
  const refId = ensureHypothesisStrategyBinding(
    plan.hypothesisBinding.nodeId,
    plan.hypothesisBinding.nodesWithNew,
    plan.hypothesisBinding.pendingEdges,
  );
  if (!refId) return plan.newNode;
  plan.newNode.data = { ...plan.newNode.data, refId };
  return plan.newNode;
}

export function applyConnectionDomainSync(
  plan: ConnectionPlan,
  nodes: readonly WorkspaceNode[],
): void {
  syncRemovedEdgesToDomain(plan.removedEdges, nodes);
  if (plan.newEdge) {
    syncDomainForNewEdge(plan.newEdge, nodes as WorkspaceNode[], plan.nextEdges as WorkspaceEdge[]);
  }
}

export function commitConnectionTransaction(
  plan: ConnectionPlan,
  nodes: readonly WorkspaceNode[],
  commit: CommitGraphPatch,
): void {
  if (!plan.newEdge) return;
  commit({ edges: plan.nextEdges });
  applyConnectionDomainSync(plan, nodes);
}

export function applySpecMaterializeDomainSync(
  nodes: readonly WorkspaceNode[],
  edges: readonly WorkspaceEdge[],
): void {
  hydrateDomainAfterSpecMaterialize(nodes as WorkspaceNode[], edges as WorkspaceEdge[]);
}

export function commitSpecMaterializeTransaction(
  nodes: readonly WorkspaceNode[],
  edges: readonly WorkspaceEdge[],
  applyAutoLayout: ApplyAutoLayout,
): void {
  applySpecMaterializeDomainSync(nodes, edges);
  applyAutoLayout();
}

export function commitOptionalInputMaterializationTransaction(input: {
  slots: readonly WorkspaceNode['type'][];
  addNode: (type: WorkspaceNode['type']) => string | undefined;
  getNodes: () => readonly WorkspaceNode[];
  getEdges: () => readonly WorkspaceEdge[];
  applyAutoLayout: ApplyAutoLayout;
}): void {
  for (const slot of input.slots) {
    input.addNode(slot);
  }
  commitSpecMaterializeTransaction(input.getNodes(), input.getEdges(), input.applyAutoLayout);
}

export function commitAddNodeTransaction(
  plan: AddNodePlan,
  reconcileGhostNodes: (nodes: WorkspaceNode[]) => WorkspaceNode[],
  commit: CommitGraphPatch,
  applyAutoLayout: ApplyAutoLayout,
): string {
  const newNode = finalizeAddNodePlan(plan);
  commit({
    nodes: reconcileGhostNodes([...plan.nodesBeforeNew, newNode]),
    edges: plan.nextEdges,
  });
  applyAutoLayout();
  return plan.nodeId;
}

export function applyRemoveNodeDomainSync(plan: RemoveNodePlan, nodeId: string): void {
  const { node } = plan;
  resetSpecSectionForRemovedNode(node);
  syncDomainForRemovedNode(node);
  if (node.type === NODE_TYPES.INCUBATOR) {
    removeCompilerPlanForNode(nodeId);
  }
  if (node.type === NODE_TYPES.HYPOTHESIS) {
    const refId = getHypothesisRefId(node);
    if (refId) removeCompilerStrategyByRefId(refId);
  }
}

export function commitRemoveNodeTransaction(
  plan: RemoveNodePlan,
  nodeId: string,
  commit: CommitGraphPatch,
  applyAutoLayout: ApplyAutoLayout,
): void {
  applyRemoveNodeDomainSync(plan, nodeId);
  commit({
    nodes: plan.nextNodes,
    edges: plan.nextEdges,
    previewNodeIdMap: plan.nextPreviewNodeIdMap,
    ...(plan.clearInspector ? { runInspectorPreviewNodeId: null } : {}),
    ...(plan.clearExpanded ? { expandedPreviewId: null } : {}),
  });
  applyAutoLayout();
}

export function applyNodeDataDomainSync(
  plan: NodeDataUpdatePlan,
  data: Record<string, unknown>,
): void {
  syncNodeDataToWorkspaceDomain(plan.previousNode, plan.mergedNode, data);
}

export function commitNodeDataTransaction(
  plan: NodeDataUpdatePlan,
  data: Record<string, unknown>,
  commit: CommitGraphPatch,
): void {
  commit({ nodes: plan.nextNodes });
  applyNodeDataDomainSync(plan, data);
}
