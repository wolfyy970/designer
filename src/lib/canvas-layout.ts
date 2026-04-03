import type { CanvasNodeType, WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';

type CanvasNode = WorkspaceNode;

export const SECTION_NODE_TYPES = new Set<CanvasNodeType>([
  'designBrief', 'existingDesign', 'researchContext',
  'objectivesMetrics', 'designConstraints',
]);

// ── Layout constants ────────────────────────────────────────────────

/** Node widths (must match the w-node / w-node-variant CSS tokens) */
const NODE_W_DEFAULT = 320;
const NODE_W_VARIANT = 480;

export const GRID_SIZE = 20;
const NODE_SPACING = 60;
const FALLBACK_H: Record<string, number> = {
  section: 400, compiler: 220, designSystem: 300, hypothesis: 440, variant: 400, critique: 260, model: 180,
};
export const DEFAULT_COL_GAP = 160;
export const MIN_COL_GAP = 80;
export const MAX_COL_GAP = 320;
/** Fallback Y coordinate when no existing nodes can be used as an anchor. */
export const DEFAULT_CANVAS_Y = 300;

// ── Helpers ──────────────────────────────────────────────────────────

/** Get a node's measured height, or a reasonable estimate */
function nodeH(node: CanvasNode): number {
  return (node.measured?.height as number | undefined) ?? (
    SECTION_NODE_TYPES.has(node.type as CanvasNodeType)
      ? FALLBACK_H.section
      : FALLBACK_H[node.type as string] ?? 200
  );
}

function nodeWidth(node: CanvasNode): number {
  return node.type === 'variant' ? NODE_W_VARIANT : NODE_W_DEFAULT;
}

/** Compute column X positions from a given gap (4 columns: sections → compiler → hypothesis → variant) */
export function columnX(gap: number) {
  const s = 0;
  const c = s + NODE_W_DEFAULT + gap;
  const h = c + NODE_W_DEFAULT + gap;
  const v = h + NODE_W_DEFAULT + gap;
  return { sections: s, compiler: c, hypothesis: h, variant: v };
}

/** Snap a position to the nearest grid point */
export function snap(pos: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE,
  };
}

/**
 * Position a prerequisite node in the column before its consumer.
 * Model → Incubator: model lands in the sections column.
 * Model → Hypothesis: model lands in the incubator column.
 */
export function computeAdjacentPosition(
  consumerPosition: { x: number; y: number },
  gap: number,
): { x: number; y: number } {
  return snap({
    x: Math.max(0, consumerPosition.x - NODE_W_DEFAULT - gap),
    y: consumerPosition.y,
  });
}

// ── Position helpers ────────────────────────────────────────────────

export function computeDefaultPosition(
  type: CanvasNodeType,
  existingNodes: CanvasNode[],
  col: ReturnType<typeof columnX>
): { x: number; y: number } {
  // Model and Design System are processing nodes — place in the compiler column
  if (type === 'model' || type === 'designSystem') {
    const processingNodes = existingNodes.filter((n) =>
      n.type === 'compiler' || n.type === 'designSystem' || n.type === 'model'
    );
    let y = 200;
    for (const pn of processingNodes) {
      y += nodeH(pn) + NODE_SPACING;
    }
    return snap({ x: col.compiler, y });
  }
  if (SECTION_NODE_TYPES.has(type)) {
    const sectionNodes = existingNodes.filter((n) =>
      SECTION_NODE_TYPES.has(n.type as CanvasNodeType)
    );
    let y = 200;
    for (const sn of sectionNodes) {
      y += nodeH(sn) + NODE_SPACING;
    }
    return snap({ x: col.sections, y });
  }
  if (type === 'compiler') {
    const compilers = existingNodes.filter((n) => n.type === 'compiler');
    if (compilers.length === 0) return snap({ x: col.compiler, y: DEFAULT_CANVAS_Y });
    const lastY = Math.max(...compilers.map((n) => n.position.y + nodeH(n)));
    return snap({ x: col.compiler, y: lastY + NODE_SPACING });
  }
  if (type === 'hypothesis') {
    const hypNodes = existingNodes.filter((n) => n.type === 'hypothesis');
    let y = 200;
    for (const hn of hypNodes) {
      y += nodeH(hn) + NODE_SPACING;
    }
    return snap({ x: col.hypothesis, y });
  }
  if (type === 'critique') {
    const critiqueNodes = existingNodes.filter((n) => n.type === 'critique');
    const variantNodes = existingNodes.filter((n) => n.type === 'variant');
    const baseY = variantNodes.length > 0
      ? Math.max(...variantNodes.map((n) => n.position.y + nodeH(n))) + NODE_SPACING
      : DEFAULT_CANVAS_Y;
    const y = critiqueNodes.length > 0
      ? Math.max(...critiqueNodes.map((n) => n.position.y + nodeH(n))) + NODE_SPACING
      : baseY;
    return snap({ x: col.variant + NODE_W_VARIANT + 80, y });
  }
  return snap({ x: col.variant, y: DEFAULT_CANVAS_Y });
}

export function computeHypothesisPositions(
  count: number,
  centerY: number,
  col: ReturnType<typeof columnX>,
  estimatedHeight = FALLBACK_H.hypothesis
) {
  const totalHeight = count * estimatedHeight + (count - 1) * NODE_SPACING;
  const startY = centerY - totalHeight / 2;
  return Array.from({ length: count }, (_, i) =>
    snap({
      x: col.hypothesis,
      y: startY + i * (estimatedHeight + NODE_SPACING),
    })
  );
}

// ── Auto-layout (edge-driven Sugiyama-style) ─────────────────────────

export function computeAutoLayout(
  nodes: CanvasNode[],
  edges: WorkspaceEdge[],
  gap: number
): CanvasNode[] {
  if (nodes.length === 0) return nodes;

  // 1. Build directed adjacency from edges
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const nodeById = new Map<string, CanvasNode>();
  for (const n of nodes) {
    nodeById.set(n.id, n);
    children.set(n.id, []);
    parents.set(n.id, []);
  }
  for (const e of edges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    children.get(e.source)!.push(e.target);
    parents.get(e.target)!.push(e.source);
  }

  // 2. Assign ranks via longest-path DFS (cycle-safe)
  const rank = new Map<string, number>();
  const onStack = new Set<string>();

  function dfs(id: string): number {
    if (rank.has(id)) return rank.get(id)!;
    if (onStack.has(id)) return 0;
    onStack.add(id);
    let maxParent = -1;
    for (const pid of parents.get(id) ?? []) {
      maxParent = Math.max(maxParent, dfs(pid));
    }
    const r = maxParent + 1;
    rank.set(id, r);
    onStack.delete(id);
    return r;
  }

  for (const n of nodes) dfs(n.id);

  // 2b. Force designSystem nodes to the same rank as compiler (processing column)
  //     DesignSystem has no incoming edges — only outgoing to hypotheses — so DFS gives rank 0.
  const compilerRank = Math.max(1, ...nodes
    .filter((n) => n.type === 'compiler')
    .map((n) => rank.get(n.id) ?? 1));
  for (const n of nodes) {
    if (n.type === 'designSystem') {
      rank.set(n.id, compilerRank);
    }
  }

  // 2c. Recompute Model node ranks based on outgoing edges
  //     Model nodes have no incoming edges — DFS gives rank 0.
  //     Place them one column before their leftmost target.
  for (const n of nodes) {
    if (n.type !== 'model') continue;
    const targets = children.get(n.id) ?? [];
    if (targets.length > 0) {
      const minTargetRank = Math.min(...targets.map((t) => rank.get(t) ?? 0));
      rank.set(n.id, Math.max(0, minTargetRank - 1));
    } else {
      rank.set(n.id, compilerRank);
    }
  }

  // 2d. Force disconnected variant nodes (archived/pinned) to the variant column rank
  //     Without edges, DFS assigns rank 0 which places them in the leftmost column.
  const variantRank = Math.max(0, ...nodes
    .filter((n) => n.type === 'variant' && (parents.get(n.id)?.length ?? 0) > 0)
    .map((n) => rank.get(n.id) ?? 0));
  if (variantRank > 0) {
    for (const n of nodes) {
      if (n.type === 'variant' && (parents.get(n.id)?.length ?? 0) === 0) {
        rank.set(n.id, variantRank);
      }
    }
  }

  // 3. Group nodes into layers by rank
  const maxRank = Math.max(0, ...rank.values());
  const layers: CanvasNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of nodes) {
    layers[rank.get(n.id) ?? 0].push(n);
  }

  const nonEmptyLayers = layers.filter((l) => l.length > 0);
  if (nonEmptyLayers.length === 0) return nodes;

  // 4. Sort nodes within each layer by barycenter
  const TYPE_ORDER: Record<string, number> = {
    designBrief: 0, existingDesign: 1, researchContext: 2,
    objectivesMetrics: 3, designConstraints: 4, model: 5,
    compiler: 6, designSystem: 7, hypothesis: 8, variant: 9, critique: 10,
  };

  nonEmptyLayers[0].sort((a, b) =>
    (TYPE_ORDER[a.type as string] ?? 99) - (TYPE_ORDER[b.type as string] ?? 99)
  );

  for (let li = 1; li < nonEmptyLayers.length; li++) {
    const prevLayer = nonEmptyLayers[li - 1];
    const prevOrder = new Map<string, number>();
    prevLayer.forEach((n, i) => prevOrder.set(n.id, i));

    nonEmptyLayers[li].sort((a, b) => {
      const aParents = (parents.get(a.id) ?? []).filter((p) => prevOrder.has(p));
      const bParents = (parents.get(b.id) ?? []).filter((p) => prevOrder.has(p));
      const aCenter = aParents.length > 0
        ? aParents.reduce((s, p) => s + prevOrder.get(p)!, 0) / aParents.length
        : Infinity;
      const bCenter = bParents.length > 0
        ? bParents.reduce((s, p) => s + prevOrder.get(p)!, 0) / bParents.length
        : Infinity;
      return aCenter - bCenter;
    });
  }

  // 5. Compute column X positions
  const layerX: number[] = [];
  let curX = 0;
  for (const layer of nonEmptyLayers) {
    layerX.push(curX);
    const widest = Math.max(...layer.map(nodeWidth));
    curX += widest + gap;
  }

  // 6. Measure each layer's total height
  const layerHeights = nonEmptyLayers.map((layer) =>
    layer.reduce((sum, n) => sum + nodeH(n), 0) +
    Math.max(0, layer.length - 1) * NODE_SPACING
  );
  const tallestHeight = Math.max(...layerHeights);

  // 7. Stack each layer centered on the tallest layer
  const centerY = 200 + tallestHeight / 2;
  const positions = new Map<string, { x: number; y: number }>();

  for (let li = 0; li < nonEmptyLayers.length; li++) {
    const layer = nonEmptyLayers[li];
    const totalH = layerHeights[li];
    let y = centerY - totalH / 2;

    for (const n of layer) {
      positions.set(n.id, snap({ x: layerX[li], y }));
      y += nodeH(n) + NODE_SPACING;
    }
  }

  // 8. Nudge single-node layers toward parent/child avg
  for (let li = 0; li < nonEmptyLayers.length; li++) {
    const layer = nonEmptyLayers[li];
    if (layer.length !== 1) continue;
    const n = layer[0];
    const pIds = parents.get(n.id) ?? [];
    const cIds = children.get(n.id) ?? [];
    const anchors: number[] = [];
    for (const pid of pIds) {
      const p = positions.get(pid);
      const pn = nodeById.get(pid);
      if (p && pn) anchors.push(p.y + nodeH(pn) / 2);
    }
    for (const cid of cIds) {
      const c = positions.get(cid);
      const cn = nodeById.get(cid);
      if (c && cn) anchors.push(c.y + nodeH(cn) / 2);
    }
    if (anchors.length > 0) {
      const avgAnchor = anchors.reduce((s, v) => s + v, 0) / anchors.length;
      const targetY = avgAnchor - nodeH(n) / 2;
      positions.set(n.id, snap({ x: positions.get(n.id)!.x, y: targetY }));
    }
  }

  // 9. Normalize Y so topmost node starts at y ≈ 100
  let minY = Infinity;
  for (const pos of positions.values()) {
    if (pos.y < minY) minY = pos.y;
  }
  const yShift = 100 - minY;
  if (Math.abs(yShift) > 1) {
    for (const [id, pos] of positions) {
      positions.set(id, snap({ x: pos.x, y: pos.y + yShift }));
    }
  }

  // 10. Apply positions
  return nodes.map((n) => {
    const pos = positions.get(n.id);
    return pos ? { ...n, position: pos } : n;
  });
}
