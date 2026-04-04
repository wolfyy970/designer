import { describe, it, expect } from 'vitest';
import { EDGE_STATUS, EDGE_TYPES, NODE_TYPES } from '../../constants/canvas';
import type { WorkspaceEdge, WorkspaceNode } from '../../types/workspace-graph';
import {
  countIncomingModelsWithModelSelected,
  countOutgoingNodesOfType,
  findFirstUpstreamModelNodeId,
  listIncomingModelCredentials,
  listIncomingSourceNodes,
  listOutgoingTargetNodes,
  nodeById,
  type WorkspaceGraphSnapshot,
} from '../graph-queries';

function edge(id: string, source: string, target: string): WorkspaceEdge {
  return {
    id,
    source,
    target,
    type: EDGE_TYPES.DATA_FLOW,
    data: { status: EDGE_STATUS.IDLE },
  };
}

function node(
  id: string,
  type: WorkspaceNode['type'],
  data: Record<string, unknown> = {},
  pos = { x: 0, y: 0 },
): WorkspaceNode {
  return { id, type, position: pos, data };
}

describe('graph-queries', () => {
  const snapshot: WorkspaceGraphSnapshot = {
    nodes: [
      node('h1', NODE_TYPES.HYPOTHESIS),
      node('m1', NODE_TYPES.MODEL, { providerId: 'openrouter', modelId: 'gpt' }),
      node('m2', NODE_TYPES.MODEL, { providerId: 'lmstudio', modelId: 'local' }),
      node('v1', NODE_TYPES.PREVIEW),
    ],
    edges: [edge('e1', 'm1', 'h1'), edge('e2', 'm2', 'h1'), edge('e3', 'h1', 'v1')],
  };

  it('nodeById returns undefined when missing', () => {
    expect(nodeById(snapshot, 'nope')).toBeUndefined();
  });

  it('findFirstUpstreamModelNodeId returns first model in edge iteration order', () => {
    expect(findFirstUpstreamModelNodeId('h1', snapshot)).toBe('m1');
  });

  it('findFirstUpstreamModelNodeId returns null when no model upstream', () => {
    expect(findFirstUpstreamModelNodeId('m1', snapshot)).toBeNull();
  });

  it('listIncomingModelCredentials collects all models with modelId', () => {
    expect(listIncomingModelCredentials('h1', snapshot)).toEqual([
      { providerId: 'openrouter', modelId: 'gpt' },
      { providerId: 'lmstudio', modelId: 'local' },
    ]);
  });

  it('listIncomingModelCredentials skips models without modelId', () => {
    const snap: WorkspaceGraphSnapshot = {
      nodes: [
        node('h1', NODE_TYPES.HYPOTHESIS),
        node('m1', NODE_TYPES.MODEL, { providerId: 'openrouter' }),
      ],
      edges: [edge('e1', 'm1', 'h1')],
    };
    expect(listIncomingModelCredentials('h1', snap)).toEqual([]);
  });

  it('listIncomingSourceNodes lists sources in edge order', () => {
    const sources = listIncomingSourceNodes('h1', snapshot);
    expect(sources.map((n) => n.id)).toEqual(['m1', 'm2']);
  });

  it('listOutgoingTargetNodes lists targets', () => {
    const targets = listOutgoingTargetNodes('h1', snapshot);
    expect(targets.map((n) => n.id)).toEqual(['v1']);
  });

  it('countIncomingModelsWithModelSelected matches list length when all have modelId', () => {
    expect(countIncomingModelsWithModelSelected('h1', snapshot)).toBe(2);
  });

  it('countOutgoingNodesOfType counts variants from hypothesis', () => {
    expect(
      countOutgoingNodesOfType('h1', NODE_TYPES.PREVIEW, snapshot),
    ).toBe(1);
  });
});
