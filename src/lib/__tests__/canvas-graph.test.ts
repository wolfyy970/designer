import { describe, it, expect } from 'vitest';
import { EDGE_STATUS, EDGE_TYPES } from '../../constants/canvas';
import { computeLineage } from '../canvas-graph';

function makeEdge(source: string, target: string) {
  return {
    id: `edge-${source}-to-${target}`,
    source,
    target,
    type: EDGE_TYPES.DATA_FLOW,
    data: { status: EDGE_STATUS.IDLE },
  };
}

describe('computeLineage', () => {
  it('returns only the selected node when no edges exist', () => {
    const result = computeLineage([], 'a');
    expect(result.nodeIds).toEqual(new Set(['a']));
    expect(result.edgeIds.size).toBe(0);
  });

  it('follows forward edges (descendants)', () => {
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = computeLineage(edges, 'a');
    expect(result.nodeIds).toEqual(new Set(['a', 'b', 'c']));
    expect(result.edgeIds.size).toBe(2);
  });

  it('follows backward edges (ancestors)', () => {
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = computeLineage(edges, 'c');
    expect(result.nodeIds).toEqual(new Set(['a', 'b', 'c']));
  });

  it('discovers sibling inputs to a shared target', () => {
    // designBrief → compiler ← model
    const edges = [makeEdge('brief', 'compiler'), makeEdge('model', 'compiler')];
    const result = computeLineage(edges, 'brief');
    expect(result.nodeIds).toEqual(new Set(['brief', 'compiler', 'model']));
    expect(result.edgeIds.size).toBe(2);
  });

  it('discovers sibling inputs from either sibling', () => {
    const edges = [makeEdge('brief', 'compiler'), makeEdge('model', 'compiler')];
    const resultFromModel = computeLineage(edges, 'model');
    expect(resultFromModel.nodeIds).toEqual(new Set(['brief', 'compiler', 'model']));
  });

  it('traverses the full pipeline: sections + model → compiler → hypothesis → variant', () => {
    const edges = [
      makeEdge('brief', 'compiler'),
      makeEdge('model', 'compiler'),
      makeEdge('compiler', 'hyp1'),
      makeEdge('model', 'hyp1'),
      makeEdge('hyp1', 'variant1'),
    ];
    const result = computeLineage(edges, 'compiler');
    expect(result.nodeIds).toEqual(new Set(['brief', 'model', 'compiler', 'hyp1', 'variant1']));
  });

  it('does not include disconnected nodes', () => {
    const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')];
    const result = computeLineage(edges, 'a');
    expect(result.nodeIds).toEqual(new Set(['a', 'b']));
    expect(result.nodeIds.has('c')).toBe(false);
    expect(result.nodeIds.has('d')).toBe(false);
  });

  it('handles cycles without infinite loop', () => {
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'a')];
    const result = computeLineage(edges, 'a');
    expect(result.nodeIds).toEqual(new Set(['a', 'b', 'c']));
  });

  it('collects all edge IDs in the connected component', () => {
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('x', 'y')];
    const result = computeLineage(edges, 'a');
    expect(result.edgeIds).toEqual(new Set(['edge-a-to-b', 'edge-b-to-c']));
    expect(result.edgeIds.has('edge-x-to-y')).toBe(false);
  });
});
