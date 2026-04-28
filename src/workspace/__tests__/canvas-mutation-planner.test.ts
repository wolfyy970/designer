import { describe, expect, it } from 'vitest';
import { EDGE_STATUS, EDGE_TYPES, NODE_TYPES } from '../../constants/canvas';
import type { WorkspaceEdge, WorkspaceNode } from '../../types/workspace-graph';
import {
  planConnectionMutation,
  planEdgeRemoval,
  planRemoveNodeMutation,
  shouldIgnoreNodeChangeRemoval,
} from '../canvas-mutation-planner';

const node = (id: string, type: WorkspaceNode['type']): WorkspaceNode => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {},
});

const edge = (source: string, target: string): WorkspaceEdge => ({
  id: `${source}->${target}`,
  source,
  target,
  type: EDGE_TYPES.DATA_FLOW,
  data: { status: EDGE_STATUS.IDLE },
});

describe('canvas mutation planner', () => {
  it('plans model replacement for a hypothesis connection', () => {
    const nodes = [
      node('model-a', NODE_TYPES.MODEL),
      node('model-b', NODE_TYPES.MODEL),
      node('h1', NODE_TYPES.HYPOTHESIS),
    ];
    const existing = edge('model-a', 'h1');

    const plan = planConnectionMutation({
      source: 'model-b',
      target: 'h1',
      nodes,
      edges: [existing],
    });

    expect(plan.removedEdges).toEqual([existing]);
    expect(plan.newEdge).toMatchObject({ source: 'model-b', target: 'h1' });
    expect(plan.nextEdges).toHaveLength(1);
    expect(plan.nextEdges[0]?.source).toBe('model-b');
  });

  it('plans hypothesis removal with preview cascade and preview map cleanup', () => {
    const nodes = [
      node('h1', NODE_TYPES.HYPOTHESIS),
      node('p1', NODE_TYPES.PREVIEW),
      node('p2', NODE_TYPES.PREVIEW),
      node('brief-1', NODE_TYPES.DESIGN_BRIEF),
    ];
    const edges = [edge('h1', 'p1'), edge('brief-1', 'h1'), edge('brief-1', 'p2')];
    const previewMap = new Map([
      ['run-a', 'p1'],
      ['run-b', 'p2'],
    ]);

    const plan = planRemoveNodeMutation({
      nodeId: 'h1',
      nodes,
      edges,
      previewNodeIdMap: previewMap,
      runInspectorPreviewNodeId: 'p1',
      expandedPreviewId: 'p2',
    });

    expect(plan?.removeIds).toEqual(new Set(['h1', 'p1']));
    expect(plan?.nextNodes.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining(['p2', 'brief-1']),
    );
    expect(plan?.nextNodes.some((candidate) => candidate.id === 'h1')).toBe(false);
    expect(plan?.nextNodes.some((candidate) => candidate.id === 'p1')).toBe(false);
    expect(plan?.nextEdges.map((candidate) => candidate.id)).toEqual(['brief-1->p2']);
    expect(plan?.nextPreviewNodeIdMap).toEqual(new Map([['run-b', 'p2']]));
    expect(plan?.clearInspector).toBe(true);
    expect(plan?.clearExpanded).toBe(false);
  });

  it('blocks protected node removals and ephemeral input ghost removals', () => {
    const nodes = [node('brief-1', NODE_TYPES.DESIGN_BRIEF)];

    expect(planRemoveNodeMutation({
      nodeId: 'brief-1',
      nodes,
      edges: [],
      previewNodeIdMap: new Map(),
      runInspectorPreviewNodeId: null,
      expandedPreviewId: null,
    })).toBeUndefined();
    expect(shouldIgnoreNodeChangeRemoval('ghost-input-researchContext', nodes)).toBe(true);
  });

  it('plans edge removals without mutating the input edge list', () => {
    const keep = edge('a', 'b');
    const remove = edge('b', 'c');
    const edges = [keep, remove];

    const plan = planEdgeRemoval(edges, (candidate) => candidate.source === 'b');

    expect(plan.removedEdges).toEqual([remove]);
    expect(plan.nextEdges).toEqual([keep]);
    expect(edges).toEqual([keep, remove]);
  });
});
