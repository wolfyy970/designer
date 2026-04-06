import { describe, it, expect } from 'vitest';
import {
  columnX,
  snap,
  computeDefaultPosition,
  computeHypothesisPositions,
  computeAutoLayout,
  reconcileInputGhostNodes,
  layoutTypeOrder,
  isEphemeralInputGhostId,
  INPUT_GHOST_ID_PREFIX,
  GRID_SIZE,
  DEFAULT_COL_GAP,
} from '../canvas-layout';
import type { WorkspaceNode } from '../../types/workspace-graph';
import { EDGE_STATUS, EDGE_TYPES } from '../../constants/canvas';
import type { WorkspaceEdge } from '../../types/workspace-graph';

function makeNode(
  id: string,
  type: string,
  position = { x: 0, y: 0 },
  measured?: { width: number; height: number },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return { id, type, position, data: {}, ...(measured ? { measured } : {}) };
}

function makeEdge(source: string, target: string): WorkspaceEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: EDGE_TYPES.DATA_FLOW,
    data: { status: EDGE_STATUS.IDLE },
  };
}

// ─── isEphemeralInputGhostId ────────────────────────────────────────

describe('isEphemeralInputGhostId', () => {
  it('matches current and legacy ghost id prefixes', () => {
    expect(isEphemeralInputGhostId(`${INPUT_GHOST_ID_PREFIX}researchContext`)).toBe(true);
    expect(isEphemeralInputGhostId('ghost-section-researchContext')).toBe(true);
    expect(isEphemeralInputGhostId('designBrief-abc')).toBe(false);
    expect(isEphemeralInputGhostId('ghost-input')).toBe(false);
  });
});

// ─── columnX ────────────────────────────────────────────────────────

describe('columnX', () => {
  it('returns inputs column at x=0', () => {
    const col = columnX(DEFAULT_COL_GAP);
    expect(col.inputs).toBe(0);
  });

  it('spaces columns by node width + gap', () => {
    const col = columnX(100);
    // NODE_W_DEFAULT is 320
    expect(col.incubator).toBe(420);  // 0 + 320 + 100
    expect(col.hypothesis).toBe(840); // 420 + 320 + 100
    expect(col.preview).toBe(1260);  // 840 + 320 + 100
  });

  it('handles minimum gap', () => {
    const col = columnX(80);
    expect(col.incubator).toBe(400);  // 0 + 320 + 80
  });
});

// ─── snap ───────────────────────────────────────────────────────────

describe('snap', () => {
  it('snaps to nearest grid point', () => {
    expect(snap({ x: 10, y: 10 })).toEqual({ x: GRID_SIZE, y: GRID_SIZE });
    expect(snap({ x: 9, y: 9 })).toEqual({ x: 0, y: 0 });
  });

  it('preserves exact grid positions', () => {
    expect(snap({ x: 40, y: 60 })).toEqual({ x: 40, y: 60 });
  });

  it('handles negative values', () => {
    // Math.round(-10/20) * 20 = Math.round(-0.5) * 20 = 0 * 20 = 0
    // Math.round(-30/20) * 20 = Math.round(-1.5) * 20 = -1 * 20 = -20
    const result = snap({ x: -10, y: -30 });
    expect(Math.abs(result.x % GRID_SIZE)).toBe(0);
    expect(Math.abs(result.y % GRID_SIZE)).toBe(0);
  });
});

// ─── computeDefaultPosition ─────────────────────────────────────────

describe('computeDefaultPosition', () => {
  const col = columnX(DEFAULT_COL_GAP);

  it('places first input node at inputs column', () => {
    const pos = computeDefaultPosition('designBrief', [], col);
    expect(pos.x).toBe(col.inputs);
  });

  it('stacks input nodes vertically', () => {
    const existing = [makeNode('n1', 'designBrief', { x: 0, y: 200 })];
    const pos = computeDefaultPosition('existingDesign', existing, col);
    expect(pos.y).toBeGreaterThan(200);
  });

  it('places incubator at incubator column', () => {
    const pos = computeDefaultPosition('incubator', [], col);
    expect(pos.x).toBe(col.incubator);
    expect(pos.y).toBe(300);
  });

  it('places designSystem in incubator column', () => {
    const pos = computeDefaultPosition('designSystem', [], col);
    expect(pos.x).toBe(col.incubator);
  });

  it('places hypothesis at hypothesis column', () => {
    const pos = computeDefaultPosition('hypothesis', [], col);
    expect(pos.x).toBe(col.hypothesis);
  });

  it('places preview at preview column by default', () => {
    const pos = computeDefaultPosition('preview', [], col);
    expect(pos.x).toBe(col.preview);
  });

  it('returns snapped positions', () => {
    const pos = computeDefaultPosition('designBrief', [], col);
    expect(pos.x % GRID_SIZE).toBe(0);
    expect(pos.y % GRID_SIZE).toBe(0);
  });
});

// ─── computeHypothesisPositions ─────────────────────────────────────

describe('computeHypothesisPositions', () => {
  const col = columnX(DEFAULT_COL_GAP);

  it('returns correct count of positions', () => {
    expect(computeHypothesisPositions(3, 500, col)).toHaveLength(3);
    expect(computeHypothesisPositions(1, 500, col)).toHaveLength(1);
    expect(computeHypothesisPositions(0, 500, col)).toHaveLength(0);
  });

  it('centers positions around centerY', () => {
    const positions = computeHypothesisPositions(3, 600, col);
    // Positions should be ordered top to bottom
    expect(positions[0].y).toBeLessThan(positions[1].y);
    expect(positions[1].y).toBeLessThan(positions[2].y);
    // The middle position should be nearest to centerY
    const midY = positions[1].y;
    expect(Math.abs(midY - 600)).toBeLessThan(400);
  });

  it('uses hypothesis column X', () => {
    const positions = computeHypothesisPositions(2, 500, col);
    for (const p of positions) {
      expect(p.x).toBe(col.hypothesis);
    }
  });

  it('produces snapped positions', () => {
    const positions = computeHypothesisPositions(3, 500, col);
    for (const p of positions) {
      expect(p.x % GRID_SIZE).toBe(0);
      // Use Object.is-safe check (handles -0)
      expect(Math.abs(p.y % GRID_SIZE)).toBe(0);
    }
  });

  it('single position is at centerY', () => {
    const [pos] = computeHypothesisPositions(1, 400, col);
    // With one node: startY = centerY - height/2, pos = startY
    // snapping may shift slightly (hypothesis fallback height matches FALLBACK_H.hypothesis)
    expect(Math.abs(pos.y - 180)).toBeLessThan(GRID_SIZE * 2);
  });
});

// ─── computeAutoLayout ──────────────────────────────────────────────

describe('computeAutoLayout', () => {
  it('returns empty array for empty input', () => {
    expect(computeAutoLayout([], [], DEFAULT_COL_GAP)).toEqual([]);
  });

  it('handles single node', () => {
    const nodes = [makeNode('n1', 'designBrief')];
    const result = computeAutoLayout(nodes, [], DEFAULT_COL_GAP);
    expect(result).toHaveLength(1);
    expect(result[0].position.y).toBe(100); // normalized to y≈100
  });

  it('ranks nodes correctly with edges', () => {
    const nodes = [
      makeNode('brief', 'designBrief'),
      makeNode('comp', 'incubator'),
      makeNode('hyp', 'hypothesis'),
    ];
    const edges = [
      makeEdge('brief', 'comp'),
      makeEdge('comp', 'hyp'),
    ];
    const result = computeAutoLayout(nodes, edges, DEFAULT_COL_GAP);
    // brief should be leftmost, incubator middle, hypothesis rightmost
    expect(result.find((n) => n.id === 'brief')!.position.x)
      .toBeLessThan(result.find((n) => n.id === 'comp')!.position.x);
    expect(result.find((n) => n.id === 'comp')!.position.x)
      .toBeLessThan(result.find((n) => n.id === 'hyp')!.position.x);
  });

  it('forces designSystem to incubator rank', () => {
    const nodes = [
      makeNode('brief', 'designBrief'),
      makeNode('comp', 'incubator'),
      makeNode('ds', 'designSystem'),
      makeNode('hyp', 'hypothesis'),
    ];
    const edges = [
      makeEdge('brief', 'comp'),
      makeEdge('comp', 'hyp'),
      makeEdge('ds', 'hyp'),
    ];
    const result = computeAutoLayout(nodes, edges, DEFAULT_COL_GAP);
    const compX = result.find((n) => n.id === 'comp')!.position.x;
    const dsX = result.find((n) => n.id === 'ds')!.position.x;
    expect(dsX).toBe(compX);
  });

  it('normalizes topmost node to y≈100', () => {
    const nodes = [
      makeNode('n1', 'designBrief'),
      makeNode('n2', 'incubator'),
    ];
    const edges = [makeEdge('n1', 'n2')];
    const result = computeAutoLayout(nodes, edges, DEFAULT_COL_GAP);
    const minY = Math.min(...result.map((n) => n.position.y));
    expect(minY).toBe(100);
  });

  it('produces snapped positions', () => {
    const nodes = [
      makeNode('n1', 'designBrief'),
      makeNode('n2', 'incubator'),
    ];
    const edges = [makeEdge('n1', 'n2')];
    const result = computeAutoLayout(nodes, edges, DEFAULT_COL_GAP);
    for (const n of result) {
      expect(n.position.x % GRID_SIZE).toBe(0);
      expect(n.position.y % GRID_SIZE).toBe(0);
    }
  });

  it('handles disconnected preview nodes', () => {
    const nodes = [
      makeNode('brief', 'designBrief'),
      makeNode('comp', 'incubator'),
      makeNode('hyp', 'hypothesis'),
      makeNode('v1', 'preview'),       // connected
      makeNode('v2', 'preview'),       // disconnected (archived)
    ];
    const edges = [
      makeEdge('brief', 'comp'),
      makeEdge('comp', 'hyp'),
      makeEdge('hyp', 'v1'),
    ];
    const result = computeAutoLayout(nodes, edges, DEFAULT_COL_GAP);
    const v1X = result.find((n) => n.id === 'v1')!.position.x;
    const v2X = result.find((n) => n.id === 'v2')!.position.x;
    // Disconnected preview should be forced to same rank as connected preview
    expect(v2X).toBe(v1X);
  });

  it('is cycle-safe', () => {
    const nodes = [
      makeNode('a', 'incubator'),
      makeNode('b', 'hypothesis'),
    ];
    // Create a cycle: a→b→a
    const edges = [
      makeEdge('a', 'b'),
      makeEdge('b', 'a'),
    ];
    // Should not throw or infinite loop
    const result = computeAutoLayout(nodes, edges, DEFAULT_COL_GAP);
    expect(result).toHaveLength(2);
  });
});

// ─── reconcileInputGhostNodes / layoutTypeOrder ─────────────────────

describe('reconcileInputGhostNodes', () => {
  it('adds four ghosts when optional input slots are absent', () => {
    const nodes = [makeNode('b', 'designBrief')];
    const out = reconcileInputGhostNodes(nodes as WorkspaceNode[]);
    expect(out).toHaveLength(5);
    const ghosts = out.filter((n) => n.type === 'inputGhost');
    expect(ghosts).toHaveLength(4);
    expect(ghosts.map((g) => (g.data as { targetType: string }).targetType)).toEqual([
      'researchContext',
      'objectivesMetrics',
      'designConstraints',
      'existingDesign',
    ]);
  });

  it('skips slots listed in dismissedSlots', () => {
    const nodes = [makeNode('b', 'designBrief')] as WorkspaceNode[];
    const out = reconcileInputGhostNodes(nodes, ['researchContext', 'existingDesign']);
    const targets = out
      .filter((n) => n.type === 'inputGhost')
      .map((g) => (g.data as { targetType: string }).targetType);
    expect(targets).toEqual(['objectivesMetrics', 'designConstraints']);
  });

  it('drops stale ghosts and skips slots with a real node', () => {
    const nodes = [
      makeNode('b', 'designBrief'),
      {
        id: 'ghost-input-existingDesign',
        type: 'inputGhost',
        position: { x: 0, y: 0 },
        data: { targetType: 'existingDesign' },
      },
      makeNode('e', 'existingDesign'),
    ] as WorkspaceNode[];
    const out = reconcileInputGhostNodes(nodes);
    expect(out.some((n) => n.id === 'ghost-input-existingDesign')).toBe(false);
    expect(out.filter((n) => n.type === 'inputGhost')).toHaveLength(3);
  });
});

describe('layoutTypeOrder', () => {
  it('orders ghosts research before existing design', () => {
    const ghostResearch: WorkspaceNode = {
      id: 'g1',
      type: 'inputGhost',
      position: { x: 0, y: 0 },
      data: { targetType: 'researchContext' },
    };
    const ghostExisting: WorkspaceNode = {
      id: 'g2',
      type: 'inputGhost',
      position: { x: 0, y: 0 },
      data: { targetType: 'existingDesign' },
    };
    expect(layoutTypeOrder(ghostResearch)).toBeLessThan(layoutTypeOrder(ghostExisting));
  });

  it('places real optional inputs before ghosts and model last in layer 0', () => {
    const brief = makeNode('b', 'designBrief') as WorkspaceNode;
    const real = makeNode('r', 'researchContext') as WorkspaceNode;
    const ghost: WorkspaceNode = {
      id: 'g',
      type: 'inputGhost',
      position: { x: 0, y: 0 },
      data: { targetType: 'objectivesMetrics' },
    };
    const model = makeNode('m', 'model') as WorkspaceNode;
    expect(layoutTypeOrder(brief)).toBeLessThan(layoutTypeOrder(real));
    expect(layoutTypeOrder(real)).toBeLessThan(layoutTypeOrder(ghost));
    expect(layoutTypeOrder(ghost)).toBeLessThan(layoutTypeOrder(model));
  });
});
