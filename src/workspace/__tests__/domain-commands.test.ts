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
  type: NODE_TYPES.INCUBATOR,
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

  it('syncDomainForNewEdge links compiler→hypothesis (model edges are no-ops now)', () => {
    const nodes = [model, compiler, hypothesis];
    syncDomainForNewEdge(e('c1', 'h1'), nodes, [e('c1', 'h1')]);
    syncDomainForNewEdge(e('m1', 'h1'), nodes, [e('c1', 'h1'), e('m1', 'h1')]);
    const s = useWorkspaceDomainStore.getState();
    expect(s.hypotheses.h1?.incubatorId).toBe('c1');
    expect(s.hypotheses.h1?.strategyId).toBe('vs1');
  });

  it('syncDomainForRemovedEdge detaches the removed input from its incubator', () => {
    // The real removal path. (The previous version of this test wrote
    // `incubatorModelNodeIds` straight into the store and read it back — it
    // exercised no production code at all.)
    const brief: WorkspaceNode = {
      id: 'b1',
      type: NODE_TYPES.DESIGN_BRIEF,
      position: { x: 0, y: 0 },
      data: {},
    };
    const store = useWorkspaceDomainStore.getState();
    store.ensureIncubatorWiring('c1');
    store.attachIncubatorInput('c1', 'b1', NODE_TYPES.DESIGN_BRIEF);
    expect(useWorkspaceDomainStore.getState().incubatorWirings.c1?.inputNodeIds).toEqual(['b1']);

    syncDomainForRemovedEdge(e('b1', 'c1'), [brief, compiler]);

    expect(useWorkspaceDomainStore.getState().incubatorWirings.c1?.inputNodeIds ?? []).toEqual([]);
  });

  it('syncDomainForRemovedEdge is a no-op when either endpoint node is gone', () => {
    const store = useWorkspaceDomainStore.getState();
    store.ensureIncubatorWiring('c1');
    store.attachIncubatorInput('c1', 'b1', NODE_TYPES.DESIGN_BRIEF);

    // `b1` was deleted from the graph, so the edge removal cannot resolve it.
    syncDomainForRemovedEdge(e('b1', 'c1'), [compiler]);

    // The wiring is left as-is rather than being silently cleared.
    expect(useWorkspaceDomainStore.getState().incubatorWirings.c1?.inputNodeIds).toEqual(['b1']);
  });

  it('syncDomainForRemovedNode purges compiler incubator', () => {
    useWorkspaceDomainStore.getState().ensureIncubatorWiring('c1');
    useWorkspaceDomainStore.setState({
      hypotheses: {
        h1: {
          id: 'h1',
          incubatorId: 'c1',
          strategyId: 'vs1',
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
