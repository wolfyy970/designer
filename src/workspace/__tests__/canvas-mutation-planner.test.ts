import { describe, expect, it } from 'vitest';
import { EDGE_STATUS, EDGE_TYPES, NODE_TYPES } from '../../constants/canvas';
import type { WorkspaceEdge, WorkspaceNode } from '../../types/workspace-graph';
import {
  planAddNodeMutation,
  planConnectionMutation,
  planEdgeRemoval,
  planNodeDataUpdate,
  planOptionalInputMaterialization,
  planRemoveNodeMutation,
  shouldIgnoreNodeChangeRemoval,
} from '../canvas-mutation-planner';
import type { DesignSpec } from '../../types/spec';

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
  it('plans hypothesis add with model/incubator auto edges and binding inputs', () => {
    const nodes = [
      node('inc-1', NODE_TYPES.INCUBATOR),
      node('model-1', NODE_TYPES.MODEL),
    ];
    const ids = ['hypothesis-id'];
    const plan = planAddNodeMutation({
      type: NODE_TYPES.HYPOTHESIS,
      nodes,
      edges: [],
      colGap: 200,
      generateId: () => ids.shift() ?? 'extra',
    });

    expect(plan?.nodeId).toBe('hypothesis-hypothesis-id');
    expect(plan?.nextNodes.some((candidate) => candidate.id === 'hypothesis-hypothesis-id')).toBe(true);
    expect(plan?.nextEdges.map((candidate) => [candidate.source, candidate.target])).toEqual(
      expect.arrayContaining([
        ['inc-1', 'hypothesis-hypothesis-id'],
        ['model-1', 'hypothesis-hypothesis-id'],
      ]),
    );
    expect(plan?.hypothesisBinding).toMatchObject({
      nodeId: 'hypothesis-hypothesis-id',
    });
  });

  it('plans prerequisite insertion before adding a dependent node', () => {
    const ids = ['design-system-id', 'model-id'];
    const plan = planAddNodeMutation({
      type: NODE_TYPES.DESIGN_SYSTEM,
      nodes: [node('inc-1', NODE_TYPES.INCUBATOR)],
      edges: [],
      colGap: 200,
      generateId: () => ids.shift() ?? 'extra',
    });

    expect(plan?.nodeId).toBe('designSystem-design-system-id');
    expect(plan?.prerequisiteNode).toMatchObject({
      id: 'model-model-id',
      type: NODE_TYPES.MODEL,
    });
    expect(plan?.nextNodes.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining(['model-model-id', 'designSystem-design-system-id']),
    );
  });

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

  it('plans optional input materialization from spec content', () => {
    const spec = {
      id: 'spec-1',
      title: 'Spec',
      createdAt: '2026-01-01T00:00:00Z',
      lastModified: '2026-01-01T00:00:00Z',
      version: 1,
      sections: {
        'research-context': {
          id: 'research-context',
          content: 'Research',
          images: [],
          lastModified: '2026-01-01T00:00:00Z',
        },
      },
    } satisfies DesignSpec;

    expect(planOptionalInputMaterialization(spec, [])).toContain(NODE_TYPES.RESEARCH_CONTEXT);
    expect(planOptionalInputMaterialization(spec, [node('research-1', NODE_TYPES.RESEARCH_CONTEXT)])).not.toContain(
      NODE_TYPES.RESEARCH_CONTEXT,
    );
  });

  it('plans node data updates without mutating the input nodes', () => {
    const nodes = [node('model-1', NODE_TYPES.MODEL)];
    const plan = planNodeDataUpdate({
      nodeId: 'model-1',
      nodes,
      data: { title: 'Updated' },
    });

    expect(plan?.previousNode.data).toEqual({});
    expect(plan?.mergedNode.data).toEqual({ title: 'Updated' });
    expect(plan?.nextNodes[0]?.data).toEqual({ title: 'Updated' });
    expect(nodes[0]?.data).toEqual({});
  });
});
