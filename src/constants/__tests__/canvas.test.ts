import { describe, it, expect } from 'vitest';
import {
  NODE_TYPES,
  EDGE_TYPES,
  EDGE_STATUS,
  NODE_STATUS,
  buildEdgeId,
  type NodeType,
  type EdgeType,
  type EdgeStatus,
  type NodeStatus,
} from '../canvas';

describe('NODE_TYPES', () => {
  it('contains all 10 expected node types', () => {
    const expected = [
      'designBrief', 'existingDesign', 'researchContext',
      'objectivesMetrics', 'designConstraints', 'designSystem',
      'incubator', 'hypothesis', 'preview', 'model',
    ];
    expect(Object.values(NODE_TYPES)).toEqual(expect.arrayContaining(expected));
    expect(Object.values(NODE_TYPES)).toHaveLength(expected.length);
  });

  it('values match their expected string literals', () => {
    expect(NODE_TYPES.DESIGN_BRIEF).toBe('designBrief');
    expect(NODE_TYPES.INCUBATOR).toBe('incubator');
    expect(NODE_TYPES.PREVIEW).toBe('preview');
    expect(NODE_TYPES.MODEL).toBe('model');
  });

  it('NodeType derives all values from NODE_TYPES', () => {
    const val: NodeType = NODE_TYPES.HYPOTHESIS;
    expect(val).toBe('hypothesis');
  });
});

describe('EDGE_TYPES', () => {
  it('DATA_FLOW equals dataFlow', () => {
    expect(EDGE_TYPES.DATA_FLOW).toBe('dataFlow');
  });

  it('EdgeType narrows to the correct literal', () => {
    const val: EdgeType = EDGE_TYPES.DATA_FLOW;
    expect(val).toBe('dataFlow');
  });
});

describe('EDGE_STATUS', () => {
  it('contains idle, processing, complete, error', () => {
    expect(EDGE_STATUS.IDLE).toBe('idle');
    expect(EDGE_STATUS.PROCESSING).toBe('processing');
    expect(EDGE_STATUS.COMPLETE).toBe('complete');
    expect(EDGE_STATUS.ERROR).toBe('error');
  });

  it('EdgeStatus type covers all four values', () => {
    const statuses: EdgeStatus[] = [
      EDGE_STATUS.IDLE, EDGE_STATUS.PROCESSING, EDGE_STATUS.COMPLETE, EDGE_STATUS.ERROR,
    ];
    expect(statuses).toHaveLength(4);
  });
});

describe('NODE_STATUS', () => {
  it('contains all 6 visual states', () => {
    expect(NODE_STATUS.SELECTED).toBe('selected');
    expect(NODE_STATUS.PROCESSING).toBe('processing');
    expect(NODE_STATUS.ERROR).toBe('error');
    expect(NODE_STATUS.DIMMED).toBe('dimmed');
    expect(NODE_STATUS.FILLED).toBe('filled');
    expect(NODE_STATUS.EMPTY).toBe('empty');
  });

  it('NodeStatus type covers all 6 values', () => {
    const statuses: NodeStatus[] = [
      NODE_STATUS.SELECTED, NODE_STATUS.PROCESSING, NODE_STATUS.ERROR,
      NODE_STATUS.DIMMED, NODE_STATUS.FILLED, NODE_STATUS.EMPTY,
    ];
    expect(statuses).toHaveLength(6);
  });
});

describe('buildEdgeId', () => {
  it('produces edge-{source}-to-{target} format', () => {
    expect(buildEdgeId('a', 'b')).toBe('edge-a-to-b');
    expect(buildEdgeId('compiler-1', 'hyp-2')).toBe('edge-compiler-1-to-hyp-2');
  });

  it('both arguments are reflected in the output', () => {
    const id = buildEdgeId('src', 'tgt');
    expect(id).toContain('src');
    expect(id).toContain('tgt');
  });
});
