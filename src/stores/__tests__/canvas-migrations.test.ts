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

// ── Corruption recovery — `{}` fallback in canvas-store migrate wrapper ──
//
// `canvas-store.ts:70–79` wraps `migrateCanvasState` in a try/catch and
// falls back to `migrateCanvasState({}, version)` if the persisted blob
// fails to parse. This test locks in that `{}` is a **safe** recovery input
// at every version:
//   • never throws,
//   • always returns a non-null object (Zustand's `persist` middleware then
//     merges with `initialCanvasState`, so missing `nodes` / `edges` / UI
//     fields default to the fresh shape).
// At early versions (<4) the migrator returns a full `FRESH_STATE`; at
// later versions it returns `{}` and relies on the merge. Both are valid.

describe('migrateCanvasState({}, version) — corruption recovery contract', () => {
  for (const v of [0, 1, 5, 10, 15, 20, 24, 25, 26, 27]) {
    it(`recovers safely at v${v} (never throws, returns an object)`, () => {
      let result: Record<string, unknown> | undefined;
      expect(() => {
        result = migrateCanvasState({}, v);
      }).not.toThrow();
      expect(result).not.toBeNull();
      expect(typeof result).toBe('object');
    });
  }
});

describe('migrateCanvasState final shape validation', () => {
  it('normalizes malformed top-level collections to safe defaults', () => {
    const result = migrateCanvasState(
      { nodes: 'bad', edges: null, viewport: 'bad', showMiniMap: 'bad', colGap: 'bad' },
      29,
    );
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.viewport).toEqual({ x: 0, y: 0, zoom: 0.85 });
    expect(result.showMiniMap).toBe(true);
    expect(result.colGap).toBeGreaterThan(0);
  });
});

// ── v0/v1 → fresh reset ──────────────────────────────────────────────

describe('v0/v1 → v4: complete reset', () => {
  it('returns fresh state for version 0', () => {
    const result = migrateCanvasState({ nodes: [makeNode('x', 'incubator')] }, 0);
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
        makeNode('n2', 'incubator'),
      ],
      edges: [makeEdge('e-generator-1', 'n1', 'n2')],
    };
    const result = migrateCanvasState(state, 5);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    // v5→v6 renames generator→designer, then v8→v9 removes designer nodes
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('incubator');

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

    // v6→v7 adds variantStrategyId, then v19→v20 renames it to strategyId
    expect(v1Data.strategyId).toBe('vs-abc');
    expect(v2Data.strategyId).toBeUndefined();
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
    // v6→v7 keeps existing variantStrategyId, then v19→v20 renames it to strategyId
    expect((nodes[0].data as Record<string, unknown>).strategyId).toBe('vs-existing');
  });
});

// ── v8 → v9: remove designer nodes ──────────────────────────────────

describe('v8 → v9: remove designer nodes', () => {
  it('removes designer nodes and their edges', () => {
    const state = {
      nodes: [
        makeNode('c1', 'incubator'),
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
        makeNode('c1', 'incubator', { providerId: 'openrouter', modelId: 'claude-3' }),
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
        makeNode('c1', 'incubator', { providerId: 'openrouter', modelId: 'claude-3' }),
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
        makeNode('c1', 'incubator', { providerId: 'openrouter', modelId: 'claude-3' }),
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
        makeNode('c1', 'incubator'),
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
        makeNode('c1', 'incubator', { providerId: 'openrouter', modelId: 'claude-3' }),
      ],
      edges: [makeEdge('e1', 's1', 'c1')],
    };
    const result = migrateCanvasState(state, 12);
    const edges = result.edges as Array<Record<string, unknown>>;

    expect(edges.find((e) => e.id === 'e1')).toBeDefined();
  });
});

describe('v13 → v15: hypothesis/model generation fields', () => {
  it('applies v13→v14 then v14→v15: thinking on model; v22→v23 strips canvas agentMode', () => {
    const state = {
      nodes: [
        makeNode('m1', 'model', { modelId: 'x', providerId: 'openrouter' }),
        makeNode('h1', 'hypothesis', { refId: 'vs1', agentMode: 'agentic' }),
      ],
      edges: [makeEdge('e1', 'm1', 'h1')],
    };
    const result = migrateCanvasState(state, 13);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const h = nodes.find((n) => n.id === 'h1');
    const m = nodes.find((n) => n.id === 'm1');
    expect((h!.data as Record<string, unknown>)).not.toHaveProperty('agentMode');
    expect((m!.data as Record<string, unknown>).agentMode).toBeUndefined();
    expect((m!.data as Record<string, unknown>).thinkingLevel).toBe('minimal');
  });
});

describe('v14 → v15: hypothesis agentMode, model thinkingLevel', () => {
  it('moves agent mode back to hypothesis and thinking onto models (agentMode later stripped at v23)', () => {
    const state = {
      nodes: [
        makeNode('m1', 'model', {
          modelId: 'x',
          providerId: 'openrouter',
          agentMode: 'agentic',
        }),
        makeNode('h1', 'hypothesis', { refId: 'vs1', thinkingLevel: 'medium' }),
      ],
      edges: [makeEdge('e1', 'm1', 'h1')],
    };
    const result = migrateCanvasState(state, 14);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const h = nodes.find((n) => n.id === 'h1');
    const m = nodes.find((n) => n.id === 'm1');
    expect((h!.data as Record<string, unknown>)).not.toHaveProperty('agentMode');
    expect((h!.data as Record<string, unknown>).thinkingLevel).toBeUndefined();
    expect((m!.data as Record<string, unknown>).agentMode).toBeUndefined();
    expect((m!.data as Record<string, unknown>).thinkingLevel).toBe('medium');
  });
});

describe('v15 → v16: remove critique nodes', () => {
  it('drops critique nodes and edges that touch them', () => {
    const state = {
      nodes: [
        makeNode('c1', 'incubator'),
        makeNode('q1', 'critique', {}),
        makeNode('v1', 'variant', {}),
      ],
      edges: [makeEdge('e1', 'v1', 'q1'), makeEdge('e2', 'q1', 'c1')],
    };
    const result = migrateCanvasState(state, 15);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const edges = result.edges as Array<Record<string, unknown>>;
    expect(nodes.some((n) => n.type === 'critique')).toBe(false);
    expect(nodes.map((n) => n.id).sort()).toEqual(['c1', 'v1']);
    expect(edges.map((e) => e.id as string).sort()).toEqual([]);
  });
});

describe('v16 → v17: strip ghost placeholder nodes', () => {
  it('removes ephemeral ghost nodes from persisted snapshot', () => {
    const state = {
      nodes: [
        makeNode('b', 'designBrief'),
        {
          id: 'ghost-section-researchContext',
          type: 'sectionGhost',
          position: { x: 0, y: 0 },
          data: { targetType: 'researchContext' },
        },
      ],
      edges: [],
    };
    const result = migrateCanvasState(state, 16);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    expect(nodes.some((n) => n.type === 'sectionGhost')).toBe(false);
    expect(nodes.some((n) => n.type === 'inputGhost')).toBe(false);
    expect(nodes.map((n) => n.id)).toEqual(['b']);
  });
});

describe('v17 → v18: remove ghost-dismiss persistence', () => {
  it('drops dismissedSectionGhostSlots', () => {
    const state = { nodes: [makeNode('b', 'designBrief')], edges: [], dismissedSectionGhostSlots: ['researchContext'] };
    const result = migrateCanvasState(state, 17);
    expect(result).not.toHaveProperty('dismissedSectionGhostSlots');
    expect(result).not.toHaveProperty('dismissedInputGhostSlots');
  });
});

describe('v18 → v19: remove legacy ghost-dismiss persistence', () => {
  it('drops dismissedSectionGhostSlots arrays', () => {
    const state = {
      nodes: [makeNode('b', 'designBrief')],
      edges: [],
      dismissedSectionGhostSlots: ['researchContext', 'not-a-slot', 'objectivesMetrics', ''],
    };
    const result = migrateCanvasState(state, 18);
    expect(result).not.toHaveProperty('dismissedSectionGhostSlots');
    expect(result).not.toHaveProperty('dismissedInputGhostSlots');
  });

  it('drops non-array dismissedSectionGhostSlots', () => {
    const state = {
      nodes: [],
      edges: [],
      dismissedSectionGhostSlots: 'invalid',
    };
    const result = migrateCanvasState(state, 18);
    expect(result).not.toHaveProperty('dismissedSectionGhostSlots');
    expect(result).not.toHaveProperty('dismissedInputGhostSlots');
  });
});

// ── v19 → v20: rename variant → preview, variantStrategyId → strategyId ─

describe('v19 → v20: rename variant to preview', () => {
  it('renames variant node type to preview', () => {
    const state = {
      nodes: [
        makeNode('v1', 'variant', { variantStrategyId: 'vs-1', refId: 'r1' }),
        makeNode('h1', 'hypothesis', { refId: 'vs-1' }),
      ],
      edges: [makeEdge('e1', 'h1', 'v1')],
    };
    const result = migrateCanvasState(state, 19);
    const nodes = result.nodes as Array<Record<string, unknown>>;

    const v1 = nodes.find((n) => n.id === 'v1')!;
    expect(v1.type).toBe('preview');
    const v1Data = v1.data as Record<string, unknown>;
    expect(v1Data.strategyId).toBe('vs-1');
    expect(v1Data.variantStrategyId).toBeUndefined();
    expect(v1Data.refId).toBe('r1');

    const h1 = nodes.find((n) => n.id === 'h1')!;
    expect(h1.type).toBe('hypothesis');
  });

  it('preserves edges unchanged', () => {
    const state = {
      nodes: [
        makeNode('v1', 'variant', { variantStrategyId: 'vs-1' }),
        makeNode('h1', 'hypothesis', { refId: 'vs-1' }),
      ],
      edges: [makeEdge('e1', 'h1', 'v1')],
    };
    const result = migrateCanvasState(state, 19);
    const edges = result.edges as Array<Record<string, unknown>>;

    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('h1');
    expect(edges[0].target).toBe('v1');
  });

  it('handles variant nodes without variantStrategyId', () => {
    const state = {
      nodes: [makeNode('v1', 'variant', { refId: 'r1' })],
      edges: [],
    };
    const result = migrateCanvasState(state, 19);
    const nodes = result.nodes as Array<Record<string, unknown>>;

    const v1 = nodes[0];
    expect(v1.type).toBe('preview');
    expect((v1.data as Record<string, unknown>).strategyId).toBeUndefined();
  });

  it('does not touch non-variant nodes', () => {
    const state = {
      nodes: [
        makeNode('c1', 'incubator'),
        makeNode('h1', 'hypothesis', { refId: 'vs-1' }),
        makeNode('m1', 'model', { modelId: 'x' }),
      ],
      edges: [],
    };
    const result = migrateCanvasState(state, 19);
    const nodes = result.nodes as Array<Record<string, unknown>>;

    expect(nodes.find((n) => n.id === 'c1')!.type).toBe('incubator');
    expect(nodes.find((n) => n.id === 'h1')!.type).toBe('hypothesis');
    expect(nodes.find((n) => n.id === 'm1')!.type).toBe('model');
  });
});

// ── v20 → v21: compiler node type → incubator ───────────────────────

describe('v20 → v21: rename compiler node type to incubator', () => {
  it('rewrites compiler nodes to incubator', () => {
    const state = {
      nodes: [
        makeNode('c1', 'compiler', { hypothesisCount: 2 }),
        makeNode('h1', 'hypothesis'),
      ],
      edges: [makeEdge('e1', 'c1', 'h1')],
    };
    const result = migrateCanvasState(state, 20);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const c1 = nodes.find((n) => n.id === 'c1')!;
    expect(c1.type).toBe('incubator');
    expect((c1.data as Record<string, unknown>).hypothesisCount).toBe(2);
  });
});

// ── v21 → v22: sectionGhost → inputGhost + persist keys ─────────────

describe('v21 → v22: input ghost ids, node type, and dismissed-slot keys', () => {
  it('rewrites ghost-section ids, renames node type, and migrates persist fields', () => {
    const state = {
      nodes: [
        makeNode('b', 'designBrief'),
        {
          id: 'ghost-section-researchContext',
          type: 'sectionGhost',
          position: { x: 0, y: 0 },
          data: { targetType: 'researchContext' },
        },
      ],
      edges: [],
      dismissedSectionGhostSlots: ['objectivesMetrics'],
      sectionGhostToolbarNudge: true,
    };
    const result = migrateCanvasState(state, 21);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    expect(nodes.find((n) => n.id === 'ghost-input-researchContext')?.type).toBe('inputGhost');
    expect(nodes.some((n) => n.id === 'ghost-section-researchContext')).toBe(false);
    expect(result).not.toHaveProperty('dismissedInputGhostSlots');
    expect(result).not.toHaveProperty('inputGhostToolbarNudge');
    expect(result).not.toHaveProperty('dismissedSectionGhostSlots');
    expect(result).not.toHaveProperty('sectionGhostToolbarNudge');
  });

  it('rewrites edge endpoints when ghost ids change', () => {
    const state = {
      nodes: [
        makeNode('b', 'designBrief'),
        {
          id: 'ghost-section-researchContext',
          type: 'sectionGhost',
          position: { x: 0, y: 0 },
          data: { targetType: 'researchContext' },
        },
        makeNode('inc', 'incubator'),
      ],
      edges: [
        makeEdge('e1', 'ghost-section-researchContext', 'inc'),
        makeEdge('e2', 'b', 'ghost-section-researchContext'),
      ],
    };
    const result = migrateCanvasState(state, 21);
    const edges = result.edges as Array<Record<string, unknown>>;
    expect(edges.some((e) => e.source === 'ghost-input-researchContext' || e.target === 'ghost-input-researchContext')).toBe(
      true,
    );
    expect(edges.some((e) => e.source === 'ghost-section-researchContext' || e.target === 'ghost-section-researchContext')).toBe(
      false,
    );
  });
});

describe('v22 → v23: strip hypothesis agentMode from canvas', () => {
  it('removes agentMode from hypothesis node data', () => {
    const state = {
      nodes: [
        makeNode('h1', 'hypothesis', { refId: 'vs1', agentMode: 'single' }),
        makeNode('m1', 'model', { modelId: 'x', providerId: 'p' }),
      ],
      edges: [],
    };
    const result = migrateCanvasState(state, 22);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const h = nodes.find((n) => n.id === 'h1');
    expect((h!.data as Record<string, unknown>)).not.toHaveProperty('agentMode');
  });
});

describe('v23 → v24: remove dead showGrid flag', () => {
  it('drops showGrid from persisted canvas state', () => {
    const state = {
      nodes: [],
      edges: [],
      showGrid: false,
    };
    const result = migrateCanvasState(state, 23);
    expect(result).not.toHaveProperty('showGrid');
  });
});

describe('v24 → v25: single model edge per hypothesis', () => {
  it('keeps the first model→hypothesis edge and drops later duplicates', () => {
    const state = {
      nodes: [
        makeNode('m1', 'model'),
        makeNode('m2', 'model'),
        makeNode('h1', 'hypothesis'),
      ],
      edges: [
        makeEdge('e1', 'm1', 'h1'),
        makeEdge('e2', 'm2', 'h1'),
      ],
    };
    const result = migrateCanvasState(state, 24);
    const edges = result.edges as Array<Record<string, unknown>>;
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe('m1');
    expect(edges[0].target).toBe('h1');
  });
});

describe('v25 → v26: dedupe edges by id', () => {
  it('keeps the first edge when duplicate ids appear', () => {
    const dup = makeEdge('edge-incubator-a-to-hypothesis-b', 'a', 'b');
    const state = {
      nodes: [],
      edges: [dup, { ...dup }],
    };
    const result = migrateCanvasState(state, 25);
    const edges = result.edges as Array<Record<string, unknown>>;
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe('edge-incubator-a-to-hypothesis-b');
  });
});

describe('v26 → v27: strip hypothesisGhost nodes', () => {
  it('removes hypothesisGhost nodes and edges that reference them', () => {
    const state = {
      nodes: [
        makeNode('ic', 'incubator'),
        { id: 'ghost-hypothesis', type: 'hypothesisGhost', data: {}, position: { x: 0, y: 0 } },
        makeNode('h1', 'hypothesis'),
      ],
      edges: [
        makeEdge('e1', 'ic', 'h1'),
        makeEdge('e2', 'ghost-hypothesis', 'h1'),
      ],
    };
    const result = migrateCanvasState(state, 26);
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const edges = result.edges as Array<Record<string, unknown>>;
    expect(nodes.some((n) => n.type === 'hypothesisGhost')).toBe(false);
    expect(nodes.map((n) => n.id)).toEqual(['ic', 'h1']);
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe('e1');
  });
});

describe('v27 → v28: make auto layout implicit', () => {
  it('drops persisted autoLayout state', () => {
    const result = migrateCanvasState(
      {
        nodes: [],
        edges: [],
        autoLayout: false,
      },
      27,
    );
    expect(result).not.toHaveProperty('autoLayout');
  });
});

describe('v28 → v29: remove ghost-dismiss state', () => {
  it('drops dismissed input ghost persistence', () => {
    const result = migrateCanvasState(
      {
        nodes: [],
        edges: [],
        dismissedInputGhostSlots: ['researchContext'],
        dismissedSectionGhostSlots: ['researchContext'],
      },
      28,
    );
    expect(result).not.toHaveProperty('dismissedInputGhostSlots');
    expect(result).not.toHaveProperty('dismissedSectionGhostSlots');
  });
});

describe('v29 → v30: retire existing design nodes', () => {
  it('strips legacy existing design nodes, ghosts, and touching edges', () => {
    const result = migrateCanvasState(
      {
        nodes: [
          makeNode('brief', 'designBrief'),
          makeNode('old-existing', 'existingDesign'),
          {
            id: 'ghost-input-existingDesign',
            type: 'inputGhost',
            position: { x: 0, y: 0 },
            data: { targetType: 'existingDesign' },
          },
          makeNode('inc', 'incubator'),
        ],
        edges: [
          makeEdge('e1', 'brief', 'inc'),
          makeEdge('e2', 'old-existing', 'inc'),
          makeEdge('e3', 'ghost-input-existingDesign', 'inc'),
        ],
      },
      29,
    );
    const nodes = result.nodes as Array<Record<string, unknown>>;
    const edges = result.edges as Array<Record<string, unknown>>;
    expect(nodes.map((n) => n.id).sort()).toEqual(['brief', 'inc']);
    expect(edges.map((e) => e.id)).toEqual(['e1']);
  });
});
