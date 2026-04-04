import { describe, it, expect, beforeEach } from 'vitest';
import { EDGE_STATUS, EDGE_TYPES, NODE_TYPES, buildEdgeId } from '../../constants/canvas';
import { useWorkspaceDomainStore } from '../../stores/workspace-domain-store';
import {
  syncDomainForNewEdge,
  syncDomainForRemovedEdge,
  syncDomainForRemovedNode,
} from '../domain-commands';
import type { WorkspaceEdge, WorkspaceNode } from '../../types/workspace-graph';

function e(source: string, target: string): WorkspaceEdge {
  return {
    id: buildEdgeId(source, target),
    source,
    target,
    type: EDGE_TYPES.DATA_FLOW,
    data: { status: EDGE_STATUS.IDLE },
  };
}

const model: WorkspaceNode = {
  id: 'm1',
  type: NODE_TYPES.MODEL,
  position: { x: 0, y: 0 },
  data: { modelId: 'x', providerId: 'openrouter' },
};
const compiler: WorkspaceNode = {
  id: 'c1',
  type: NODE_TYPES.COMPILER,
  position: { x: 0, y: 0 },
  data: {},
};
const hypothesis: WorkspaceNode = {
  id: 'h1',
  type: NODE_TYPES.HYPOTHESIS,
  position: { x: 0, y: 0 },
  data: { refId: 'vs1' },
};

describe('domain-commands', () => {
  beforeEach(() => {
    useWorkspaceDomainStore.getState().reset();
  });

  it('syncDomainForNewEdge links compiler→hypothesis then model→hypothesis', () => {
    const nodes = [model, compiler, hypothesis];
    syncDomainForNewEdge(e('c1', 'h1'), nodes, [e('c1', 'h1')]);
    syncDomainForNewEdge(e('m1', 'h1'), nodes, [e('c1', 'h1'), e('m1', 'h1')]);
    const s = useWorkspaceDomainStore.getState();
    expect(s.hypotheses.h1?.incubatorId).toBe('c1');
    expect(s.hypotheses.h1?.strategyId).toBe('vs1');
    expect(s.hypotheses.h1?.modelNodeIds).toContain('m1');
  });

  it('syncDomainForRemovedEdge detaches model from compiler', () => {
    useWorkspaceDomainStore.setState({
      incubatorModelNodeIds: { c1: ['m1'] },
    });
    syncDomainForRemovedEdge({ source: 'm1', target: 'c1' }, [model, compiler]);
    expect(useWorkspaceDomainStore.getState().incubatorModelNodeIds.c1 ?? []).toEqual([]);
  });

  it('syncDomainForRemovedNode purges compiler incubator', () => {
    useWorkspaceDomainStore.getState().ensureIncubatorWiring('c1');
    useWorkspaceDomainStore.setState({
      hypotheses: {
        h1: {
          id: 'h1',
          incubatorId: 'c1',
          strategyId: 'vs1',
          modelNodeIds: [],
          designSystemNodeIds: [],
          placeholder: false,
        },
      },
    });
    syncDomainForRemovedNode(compiler);
    const s = useWorkspaceDomainStore.getState();
    expect(s.incubatorWirings.c1).toBeUndefined();
    expect(s.hypotheses.h1).toBeUndefined();
  });
});
