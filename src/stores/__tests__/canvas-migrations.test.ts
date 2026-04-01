import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../../lib/storage-keys';
import { migrateCanvasState } from '../canvas-migrations';

// Mock localStorage for migration reads
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, val: string) => storage.set(key, val),
    removeItem: (key: string) => storage.delete(key),
  });
});

function makeNode(id: string, type: string, data: Record<string, unknown> = {}) {
  return { id, type, data, position: { x: 0, y: 0 } };
}

function makeEdge(id: string, source: string, target: string, type = 'dataFlow') {
  return { id, source, target, type };
}

// ── v0/v1 → fresh reset ──────────────────────────────────────────────

describe('v0/v1 → v4: complete reset', () => {
  it('returns fresh state for version 0', () => {
    const result = migrateCanvasState({ nodes: [makeNode('x', 'compiler')] }, 0);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('returns fresh state for version 1', () => {
    const result = migrateCanvasState({}, 1);
    expect(result.nodes).toEqual([]);
  });
});

// ── v2 → v3: fix stale incubator nodes ───────────────────────────────

describe('v2 → v3: rename incubator to designer', () => {
  it('renames incubator node type and ID', () => {
    const state = {
      nodes: [makeNode('incubator-node', 'incubator')],
      edges: [makeEdge('e1', 'n1', 'incubator-node')],
    };
    // v2 falls through to v3→v4 reset, but the rename logic still runs
    // Since fromVersion=2, it enters <3 block, then <4 resets to fresh
    const result = migrateCanvasState(state, 2);
    // v3→v4 resets, so we get fresh state
    expect(result.nodes).toEqual([]);
  });
});

// ── v5 → current: generator node handling ─────────────────────────────

describe('v5 → current: generator nodes handled', () => {
  it('generator is renamed to designer (v5→v6) then removed (v8→v9)', () => {
    const state = {
      nodes: [
        makeNode('n1', 'generator'),
        makeNode('n2', 'compiler'),
      ],
      edges: [makeEdge('e-generator-1', 'n1', 'n2')],
    };
    const result = migrateCanvasState(state, 5);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    // v5→v6 renames generator→designer, then v8→v9 removes designer nodes
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('compiler');

    const edges = result.edges as Array<Record<string, unknown>>;
    // Edge to/from designer also removed
    expect(edges).toHaveLength(0);
  });
});

// ── v6 → v7: add variantStrategyId to variant nodes ──────────────────

describe('v6 → v7: add variantStrategyId', () => {
  it('maps refId to variantStrategyId via generation store results', () => {
    storage.set(STORAGE_KEYS.GENERATION, JSON.stringify({
      state: {
        results: [
          { id: 'result-1', variantStrategyId: 'vs-abc' },
        ],
      },
    }));

    const state = {
      nodes: [
        makeNode('v1', 'variant', { refId: 'result-1' }),
        makeNode('v2', 'variant', { refId: 'unknown' }),
      ],
      edges: [],
    };
    const result = migrateCanvasState(state, 6);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const v1Data = nodes[0].data as Record<string, unknown>;
    const v2Data = nodes[1].data as Record<string, unknown>;

    expect(v1Data.variantStrategyId).toBe('vs-abc');
    expect(v2Data.variantStrategyId).toBeUndefined();
  });

  it('skips variants that already have variantStrategyId', () => {
    storage.set(STORAGE_KEYS.GENERATION, JSON.stringify({
      state: { results: [{ id: 'r1', variantStrategyId: 'vs-new' }] },
    }));

    const state = {
      nodes: [makeNode('v1', 'variant', { refId: 'r1', variantStrategyId: 'vs-existing' })],
      edges: [],
    };
    const result = migrateCanvasState(state, 6);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    expect((nodes[0].data as Record<string, unknown>).variantStrategyId).toBe('vs-existing');
  });
});

// ── v8 → v9: remove designer nodes ──────────────────────────────────

describe('v8 → v9: remove designer nodes', () => {
  it('removes designer nodes and their edges', () => {
    const state = {
      nodes: [
        makeNode('c1', 'compiler'),
        makeNode('d1', 'designer'),
        makeNode('h1', 'hypothesis', { refId: 'vs-1' }),
        makeNode('v1', 'variant', { variantStrategyId: 'vs-1' }),
      ],
      edges: [
        makeEdge('e1', 'c1', 'd1'),
        makeEdge('e2', 'd1', 'v1'),
        makeEdge('e3', 'c1', 'h1'),
      ],
    };
    const result = migrateCanvasState(state, 8);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const edges = result.edges as Array<Record<string, unknown>>;

    // Designer node removed
    expect(nodes.find((n) => n.type === 'designer')).toBeUndefined();
    expect(nodes).toHaveLength(3);

    // Edges to/from designer removed
    expect(edges.find((e) => e.source === 'd1' || e.target === 'd1')).toBeUndefined();

    // New hypothesis→variant edge created
    expect(edges.find((e) => e.source === 'h1' && e.target === 'v1')).toBeDefined();
  });
});

// ── v9 → v10: ensure hypothesis→variant edges ───────────────────────

describe('v9 → v10: ensure hypothesis→variant edges', () => {
  it('creates missing edges between hypotheses and matching variants', () => {
    const state = {
      nodes: [
        makeNode('h1', 'hypothesis', { refId: 'vs-1' }),
        makeNode('v1', 'variant', { variantStrategyId: 'vs-1' }),
      ],
      edges: [],
    };
    const result = migrateCanvasState(state, 9);
    const edges = result.edges as Array<Record<string, unknown>>;

    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('h1');
    expect(edges[0].target).toBe('v1');
  });

  it('does not duplicate existing edges', () => {
    const state = {
      nodes: [
        makeNode('h1', 'hypothesis', { refId: 'vs-1' }),
        makeNode('v1', 'variant', { variantStrategyId: 'vs-1' }),
      ],
      edges: [makeEdge('existing', 'h1', 'v1')],
    };
    const result = migrateCanvasState(state, 9);
    const edges = result.edges as Array<Record<string, unknown>>;

    expect(edges).toHaveLength(1);
  });
});

// ── v10 → v11: designSystem self-contained ───────────────────────────

describe('v10 → v11: designSystem node data from spec store', () => {
  it('copies content and images from spec store to designSystem node', () => {
    storage.set(STORAGE_KEYS.ACTIVE_CANVAS, JSON.stringify({
      state: {
        spec: {
          sections: {
            'design-system': {
              content: 'tokens here',
              images: [{ id: 'img1', filename: 'test.png' }],
            },
          },
        },
      },
    }));

    const state = {
      nodes: [makeNode('ds1', 'designSystem')],
      edges: [],
    };
    const result = migrateCanvasState(state, 10);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const dsData = nodes[0].data as Record<string, unknown>;

    expect(dsData.content).toBe('tokens here');
    expect(dsData.title).toBe('Design System');
    expect(dsData.images).toEqual([{ id: 'img1', filename: 'test.png' }]);
  });

  it('creates designSystem→hypothesis edges', () => {
    storage.set(STORAGE_KEYS.ACTIVE_CANVAS, JSON.stringify({
      state: { spec: { sections: { 'design-system': { content: '' } } } },
    }));

    const state = {
      nodes: [
        makeNode('ds1', 'designSystem'),
        makeNode('h1', 'hypothesis'),
        makeNode('h2', 'hypothesis'),
      ],
      edges: [],
    };
    const result = migrateCanvasState(state, 10);
    const edges = result.edges as Array<Record<string, unknown>>;

    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.source === 'ds1')).toBe(true);
  });
});

// ── v11 → v12: re-attempt designSystem data recovery ─────────────────

describe('v11 → v12: designSystem data recovery', () => {
  it('recovers content from spec store when node data is empty', () => {
    storage.set(STORAGE_KEYS.ACTIVE_CANVAS, JSON.stringify({
      state: {
        spec: {
          sections: {
            'design-system': { content: 'recovered tokens', images: [] },
          },
        },
      },
    }));

    const state = {
      nodes: [makeNode('ds1', 'designSystem', { title: 'Design System' })],
      edges: [],
    };
    const result = migrateCanvasState(state, 11);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const dsData = nodes[0].data as Record<string, unknown>;

    expect(dsData.content).toBe('recovered tokens');
  });

  it('does not overwrite existing node content', () => {
    storage.set(STORAGE_KEYS.ACTIVE_CANVAS, JSON.stringify({
      state: {
        spec: {
          sections: {
            'design-system': { content: 'from spec', images: [] },
          },
        },
      },
    }));

    const state = {
      nodes: [makeNode('ds1', 'designSystem', { content: 'user edits' })],
      edges: [],
    };
    const result = migrateCanvasState(state, 11);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const dsData = nodes[0].data as Record<string, unknown>;

    expect(dsData.content).toBe('user edits');
  });

  it('skips recovery when spec store is also empty', () => {
    const state = {
      nodes: [makeNode('ds1', 'designSystem')],
      edges: [],
    };
    const result = migrateCanvasState(state, 11);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const dsData = nodes[0].data as Record<string, unknown>;

    expect(dsData.content).toBeUndefined();
  });
});

// ── v12 → v13: extract inline model config into Model nodes ────────

describe('v12 → v13: extract inline model config into Model nodes', () => {
  it('creates Model nodes for unique (providerId, modelId) combos', () => {
    const state = {
      nodes: [
        makeNode('c1', 'compiler', { providerId: 'openrouter', modelId: 'claude-3' }),
        makeNode('h1', 'hypothesis', { refId: 'vs-1', providerId: 'openrouter', modelId: 'claude-3' }),
        makeNode('h2', 'hypothesis', { refId: 'vs-2', providerId: 'lmstudio', modelId: 'llama-3' }),
      ],
      edges: [],
    };
    const result = migrateCanvasState(state, 12);
    const nodes = result.nodes as Array<Record<string, unknown>>;

    const modelNodes = nodes.filter((n) => n.type === 'model');
    expect(modelNodes).toHaveLength(2); // Two unique combos

    // Check model node data
    const modelDataSet = modelNodes.map((n) => {
      const d = n.data as Record<string, unknown>;
      return { providerId: d.providerId, modelId: d.modelId };
    });
    expect(modelDataSet).toContainEqual({ providerId: 'openrouter', modelId: 'claude-3' });
    expect(modelDataSet).toContainEqual({ providerId: 'lmstudio', modelId: 'llama-3' });
  });

  it('creates edges from Model nodes to their targets', () => {
    const state = {
      nodes: [
        makeNode('c1', 'compiler', { providerId: 'openrouter', modelId: 'claude-3' }),
        makeNode('h1', 'hypothesis', { refId: 'vs-1', providerId: 'openrouter', modelId: 'claude-3' }),
      ],
      edges: [],
    };
    const result = migrateCanvasState(state, 12);
    const edges = result.edges as Array<Record<string, unknown>>;
    const modelNodes = (result.nodes as Array<Record<string, unknown>>).filter((n) => n.type === 'model');

    // One Model node connects to both c1 and h1
    expect(modelNodes).toHaveLength(1);
    const modelId = modelNodes[0].id as string;
    const modelEdges = edges.filter((e) => e.source === modelId);
    expect(modelEdges).toHaveLength(2);
    expect(modelEdges.map((e) => e.target).sort()).toEqual(['c1', 'h1']);
  });

  it('strips providerId/modelId from processing nodes', () => {
    const state = {
      nodes: [
        makeNode('c1', 'compiler', { providerId: 'openrouter', modelId: 'claude-3' }),
        makeNode('ds1', 'designSystem', { providerId: 'openrouter', modelId: 'claude-3', content: 'tokens' }),
        makeNode('h1', 'hypothesis', {
          refId: 'vs-1',
          providerId: 'openrouter',
          modelId: 'claude-3',
          lastRunProviderId: 'openrouter',
          lastRunModelId: 'claude-3',
        }),
      ],
      edges: [],
    };
    const result = migrateCanvasState(state, 12);
    const nodes = result.nodes as Array<Record<string, unknown>>;

    const compiler = nodes.find((n) => n.id === 'c1');
    const ds = nodes.find((n) => n.id === 'ds1');
    const hyp = nodes.find((n) => n.id === 'h1');

    const cData = compiler!.data as Record<string, unknown>;
    expect(cData.providerId).toBeUndefined();
    expect(cData.modelId).toBeUndefined();

    const dsData = ds!.data as Record<string, unknown>;
    expect(dsData.providerId).toBeUndefined();
    expect(dsData.modelId).toBeUndefined();
    expect(dsData.content).toBe('tokens'); // Preserved

    const hData = hyp!.data as Record<string, unknown>;
    expect(hData.providerId).toBeUndefined();
    expect(hData.modelId).toBeUndefined();
    // lastRun* preserved for fork detection
    expect(hData.lastRunProviderId).toBe('openrouter');
    expect(hData.lastRunModelId).toBe('claude-3');
  });

  it('skips migration when no nodes have model config', () => {
    const state = {
      nodes: [
        makeNode('c1', 'compiler'),
        makeNode('h1', 'hypothesis', { refId: 'vs-1' }),
      ],
      edges: [],
    };
    const result = migrateCanvasState(state, 12);
    const nodes = result.nodes as Array<Record<string, unknown>>;

    expect(nodes.filter((n) => n.type === 'model')).toHaveLength(0);
    expect(nodes).toHaveLength(2);
  });

  it('preserves existing edges', () => {
    const state = {
      nodes: [
        makeNode('c1', 'compiler', { providerId: 'openrouter', modelId: 'claude-3' }),
      ],
      edges: [makeEdge('e1', 's1', 'c1')],
    };
    const result = migrateCanvasState(state, 12);
    const edges = result.edges as Array<Record<string, unknown>>;

    expect(edges.find((e) => e.id === 'e1')).toBeDefined();
  });
});
