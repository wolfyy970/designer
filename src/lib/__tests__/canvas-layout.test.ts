import { describe, it, expect } from 'vitest';
import {
  columnX,
  snap,
  computeDefaultPosition,
  computeHypothesisPositions,
  computeAutoLayout,
  GRID_SIZE,
  DEFAULT_COL_GAP,
} from '../canvas-layout';
import { EDGE_STATUS, EDGE_TYPES } from '../../constants/canvas';
import type { WorkspaceEdge } from '../../types/workspace-graph';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// ─── columnX ────────────────────────────────────────────────────────

describe('columnX', () => {
  it('returns sections at x=0', () => {
    const col = columnX(DEFAULT_COL_GAP);
    expect(col.sections).toBe(0);
  });

  it('spaces columns by node width + gap', () => {
    const col = columnX(100);
    // NODE_W_DEFAULT is 320
    expect(col.compiler).toBe(420);  // 0 + 320 + 100
    expect(col.hypothesis).toBe(840); // 420 + 320 + 100
    expect(col.variant).toBe(1260);  // 840 + 320 + 100
  });

  it('handles minimum gap', () => {
    const col = columnX(80);
    expect(col.compiler).toBe(400);  // 0 + 320 + 80
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

  it('places first section at sections column', () => {
    const pos = computeDefaultPosition('designBrief', [], col);
    expect(pos.x).toBe(col.sections);
  });

  it('stacks sections vertically', () => {
    const existing = [makeNode('n1', 'designBrief', { x: 0, y: 200 })];
    const pos = computeDefaultPosition('existingDesign', existing, col);
    expect(pos.y).toBeGreaterThan(200);
  });

  it('places compiler at compiler column', () => {
    const pos = computeDefaultPosition('compiler', [], col);
    expect(pos.x).toBe(col.compiler);
    expect(pos.y).toBe(300);
  });

  it('places designSystem in compiler column', () => {
    const pos = computeDefaultPosition('designSystem', [], col);
    expect(pos.x).toBe(col.compiler);
  });

  it('places hypothesis at hypothesis column', () => {
    const pos = computeDefaultPosition('hypothesis', [], col);
    expect(pos.x).toBe(col.hypothesis);
  });

  it('places critique to the right of variant column', () => {
    const pos = computeDefaultPosition('critique', [], col);
    expect(pos.x).toBeGreaterThan(col.variant);
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
    // snapping may shift slightly
    expect(Math.abs(pos.y - 230)).toBeLessThan(GRID_SIZE * 2);
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
      makeNode('comp', 'compiler'),
      makeNode('hyp', 'hypothesis'),
    ];
    const edges = [
      makeEdge('brief', 'comp'),
      makeEdge('comp', 'hyp'),
    ];
    const result = computeAutoLayout(nodes, edges, DEFAULT_COL_GAP);
    // brief should be leftmost, compiler middle, hypothesis rightmost
    expect(result.find((n) => n.id === 'brief')!.position.x)
      .toBeLessThan(result.find((n) => n.id === 'comp')!.position.x);
    expect(result.find((n) => n.id === 'comp')!.position.x)
      .toBeLessThan(result.find((n) => n.id === 'hyp')!.position.x);
  });

  it('forces designSystem to compiler rank', () => {
    const nodes = [
      makeNode('brief', 'designBrief'),
      makeNode('comp', 'compiler'),
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
      makeNode('n2', 'compiler'),
    ];
    const edges = [makeEdge('n1', 'n2')];
    const result = computeAutoLayout(nodes, edges, DEFAULT_COL_GAP);
    const minY = Math.min(...result.map((n) => n.position.y));
    expect(minY).toBe(100);
  });

  it('produces snapped positions', () => {
    const nodes = [
      makeNode('n1', 'designBrief'),
      makeNode('n2', 'compiler'),
    ];
    const edges = [makeEdge('n1', 'n2')];
    const result = computeAutoLayout(nodes, edges, DEFAULT_COL_GAP);
    for (const n of result) {
      expect(n.position.x % GRID_SIZE).toBe(0);
      expect(n.position.y % GRID_SIZE).toBe(0);
    }
  });

  it('handles disconnected variant nodes', () => {
    const nodes = [
      makeNode('brief', 'designBrief'),
      makeNode('comp', 'compiler'),
      makeNode('hyp', 'hypothesis'),
      makeNode('v1', 'variant'),       // connected
      makeNode('v2', 'variant'),       // disconnected (archived)
    ];
    const edges = [
      makeEdge('brief', 'comp'),
      makeEdge('comp', 'hyp'),
      makeEdge('hyp', 'v1'),
    ];
    const result = computeAutoLayout(nodes, edges, DEFAULT_COL_GAP);
    const v1X = result.find((n) => n.id === 'v1')!.position.x;
    const v2X = result.find((n) => n.id === 'v2')!.position.x;
    // Disconnected variant should be forced to same rank as connected variant
    expect(v2X).toBe(v1X);
  });

  it('is cycle-safe', () => {
    const nodes = [
      makeNode('a', 'compiler'),
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
