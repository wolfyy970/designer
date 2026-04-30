import { describe, it, expect } from 'vitest';
import {
  buildAutoConnectEdges,
  buildModelEdgeForNode,
  buildModelEdgesFromParent,
  findMissingPrerequisite,
} from '../canvas-connections';

function makeNode(id: string, type: string) {
  return { id, type };
}

function makeEdge(source: string, target: string) {
  return { source, target };
}

// ── buildAutoConnectEdges (structural only, no model wiring) ────────

describe('buildAutoConnectEdges', () => {
  it('connects new section to existing compiler', () => {
    const existing = [makeNode('c1', 'incubator')];
    const edges = buildAutoConnectEdges('s1', 'designBrief', existing);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 's1', target: 'c1', type: 'dataFlow' });
  });

  it('does not connect section when no compiler exists', () => {
    const edges = buildAutoConnectEdges('s1', 'designBrief', []);
    expect(edges).toHaveLength(0);
  });

  it('does not connect section when multiple compilers exist', () => {
    const existing = [makeNode('c1', 'incubator'), makeNode('c2', 'incubator')];
    const edges = buildAutoConnectEdges('s1', 'designBrief', existing);
    expect(edges).toHaveLength(0);
  });

  it('connects all existing sections to new compiler (first compiler)', () => {
    const existing = [
      makeNode('s1', 'designBrief'),
      makeNode('s2', 'researchContext'),
      makeNode('h1', 'hypothesis'),
    ];
    const edges = buildAutoConnectEdges('c1', 'incubator', existing);
    expect(edges).toHaveLength(2);
    expect(edges.map((e) => e.source).sort()).toEqual(['s1', 's2']);
    expect(edges.every((e) => e.target === 'c1')).toBe(true);
  });

  it('does not auto-connect sections to second compiler', () => {
    const existing = [makeNode('c1', 'incubator'), makeNode('s1', 'designBrief')];
    const edges = buildAutoConnectEdges('c2', 'incubator', existing);
    expect(edges).toHaveLength(0);
  });

  it('connects new designSystem to all existing hypotheses', () => {
    const existing = [
      makeNode('h1', 'hypothesis'),
      makeNode('h2', 'hypothesis'),
      makeNode('c1', 'incubator'),
    ];
    const edges = buildAutoConnectEdges('ds1', 'designSystem', existing);
    expect(edges).toHaveLength(3);
    expect(edges.every((e) => e.source === 'ds1')).toBe(true);
    expect(edges.map((e) => e.target).sort()).toEqual(['c1', 'h1', 'h2']);
  });

  it('connects current designSystems to new hypothesis and sole compiler', () => {
    const existing = [
      makeNode('ds1', 'designSystem'),
      makeNode('ds2', 'designSystem'),
      makeNode('c1', 'incubator'),
    ];
    const edges = buildAutoConnectEdges('h1', 'hypothesis', existing);
    expect(edges).toHaveLength(3);
    const intoH1 = edges.filter((e) => e.target === 'h1');
    expect(intoH1.map((e) => e.source).sort()).toEqual(['c1', 'ds1', 'ds2']);
  });

  it('returns empty for types with no structural auto-connect rules', () => {
    const existing = [makeNode('c1', 'incubator'), makeNode('h1', 'hypothesis')];
    expect(buildAutoConnectEdges('v1', 'preview', existing)).toHaveLength(0);
  });

  it('does NOT wire models (model wiring is separate)', () => {
    const existing = [makeNode('m1', 'model')];
    expect(buildAutoConnectEdges('c1', 'incubator', existing)).toHaveLength(0);
    expect(buildAutoConnectEdges('h1', 'hypothesis', existing)).toHaveLength(0);
    expect(buildAutoConnectEdges('ds1', 'designSystem', existing)).toHaveLength(0);
  });

  it('generates deterministic edge IDs', () => {
    const existing = [makeNode('c1', 'incubator')];
    const edges = buildAutoConnectEdges('s1', 'designBrief', existing);
    expect(edges[0].id).toBe('edge-s1-to-c1');
  });

  it('edges have idle status data', () => {
    const existing = [makeNode('c1', 'incubator')];
    const edges = buildAutoConnectEdges('s1', 'designBrief', existing);
    expect(edges[0].data).toEqual({ status: 'idle' });
  });
});

// ── buildModelEdgeForNode (palette add: first model → new node) ─────

describe('buildModelEdgeForNode', () => {
  it('connects first model to new compiler', () => {
    const existing = [makeNode('m1', 'model'), makeNode('s1', 'designBrief')];
    const edges = buildModelEdgeForNode('c1', 'incubator', existing);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'm1', target: 'c1' });
  });

  it('connects first model to new hypothesis', () => {
    const existing = [makeNode('m1', 'model')];
    const edges = buildModelEdgeForNode('h1', 'hypothesis', existing);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'm1', target: 'h1' });
  });

  it('does not auto-connect a model to new designSystem', () => {
    const existing = [makeNode('m1', 'model')];
    const edges = buildModelEdgeForNode('ds1', 'designSystem', existing);
    expect(edges).toHaveLength(0);
  });

  it('returns empty when no model exists', () => {
    const edges = buildModelEdgeForNode('c1', 'incubator', []);
    expect(edges).toHaveLength(0);
  });

  it('only uses the first model, not all models', () => {
    const existing = [makeNode('m1', 'model'), makeNode('m2', 'model')];
    const edges = buildModelEdgeForNode('h1', 'hypothesis', existing);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('m1');
  });

  it('returns empty for types that do not need a model', () => {
    const existing = [makeNode('m1', 'model')];
    expect(buildModelEdgeForNode('v1', 'preview', existing)).toHaveLength(0);
    expect(buildModelEdgeForNode('s1', 'designBrief', existing)).toHaveLength(0);
    expect(buildModelEdgeForNode('m2', 'model', existing)).toHaveLength(0);
  });
});

// ── buildModelEdgesFromParent (compilation: inherit compiler's model) ─

describe('buildModelEdgesFromParent', () => {
  it('propagates compiler model to new hypotheses', () => {
    const nodes = [makeNode('m1', 'model'), makeNode('c1', 'incubator'), makeNode('h1', 'hypothesis'), makeNode('h2', 'hypothesis')];
    const edges = [makeEdge('m1', 'c1')];
    const result = buildModelEdgesFromParent('c1', ['h1', 'h2'], nodes, edges);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ source: 'm1', target: 'h1' });
    expect(result[1]).toMatchObject({ source: 'm1', target: 'h2' });
  });

  it('propagates only the first model when multiple are connected to the incubator', () => {
    const nodes = [makeNode('m1', 'model'), makeNode('m2', 'model'), makeNode('c1', 'incubator')];
    const edges = [makeEdge('m1', 'c1'), makeEdge('m2', 'c1')];
    const result = buildModelEdgesFromParent('c1', ['h1'], nodes, edges);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source: 'm1', target: 'h1' });
  });

  it('falls back to first canvas model when compiler has no model', () => {
    const nodes = [makeNode('m1', 'model'), makeNode('c1', 'incubator')];
    const edges: { source: string; target: string }[] = [];
    const result = buildModelEdgesFromParent('c1', ['h1'], nodes, edges);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ source: 'm1', target: 'h1' });
  });

  it('returns empty when no model exists anywhere', () => {
    const nodes = [makeNode('c1', 'incubator')];
    const edges: { source: string; target: string }[] = [];
    const result = buildModelEdgesFromParent('c1', ['h1'], nodes, edges);
    expect(result).toHaveLength(0);
  });

  it('does not connect non-model inputs of the parent', () => {
    const nodes = [makeNode('s1', 'designBrief'), makeNode('c1', 'incubator')];
    const edges = [makeEdge('s1', 'c1')];
    const result = buildModelEdgesFromParent('c1', ['h1'], nodes, edges);
    expect(result).toHaveLength(0);
  });
});

// ── findMissingPrerequisite ─────────────────────────────────────────

describe('findMissingPrerequisite', () => {
  it('returns "model" for compiler when no model exists', () => {
    expect(findMissingPrerequisite('incubator', [])).toBe('model');
  });

  it('returns "model" for hypothesis when no model exists', () => {
    expect(findMissingPrerequisite('hypothesis', [])).toBe('model');
  });

  it('does not require a model before adding designSystem', () => {
    expect(findMissingPrerequisite('designSystem', [])).toBeNull();
  });

  it('returns null when model already exists', () => {
    const existing = [makeNode('m1', 'model')];
    expect(findMissingPrerequisite('incubator', existing)).toBeNull();
    expect(findMissingPrerequisite('hypothesis', existing)).toBeNull();
    expect(findMissingPrerequisite('designSystem', existing)).toBeNull();
  });

  it('returns null for types with no prerequisite', () => {
    expect(findMissingPrerequisite('designBrief', [])).toBeNull();
    expect(findMissingPrerequisite('preview', [])).toBeNull();
    expect(findMissingPrerequisite('model', [])).toBeNull();
  });
});
