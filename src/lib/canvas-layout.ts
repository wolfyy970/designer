import type { InputGhostData, InputGhostTargetType } from '../types/canvas-data';
import { INPUT_GHOST_NODE_TYPE, INPUT_NODE_TYPES } from '../constants/canvas';
import type { CanvasNodeType, WorkspaceEdge, WorkspaceNode } from '../types/workspace-graph';

type CanvasNode = WorkspaceNode;

export { INPUT_NODE_TYPES };

/**
 * Canonical vertical order for optional nodes (ghosts + real input nodes in layer 0).
 * Research → objectives → constraints → design system.
 */
export const OPTIONAL_INPUT_SLOTS: readonly InputGhostTargetType[] = [
  'researchContext',
  'objectivesMetrics',
  'designConstraints',
  'designSystem',
];

/** Prefix for stable input-ghost node ids; keep in sync with onNodesChange remove guard. */
export const INPUT_GHOST_ID_PREFIX = 'ghost-input-' as const;

const LEGACY_INPUT_GHOST_ID_PREFIX = 'ghost-section-' as const;

/** True when `id` is an ephemeral input ghost (current or pre–v22 prefix). */
export function isEphemeralInputGhostId(id: string): boolean {
  return id.startsWith(INPUT_GHOST_ID_PREFIX) || id.startsWith(LEGACY_INPUT_GHOST_ID_PREFIX);
}

function inputGhostStableId(slot: InputGhostTargetType): string {
  return `${INPUT_GHOST_ID_PREFIX}${slot}`;
}

/** Unknown slot / missing targetType sorts after known slots in a tier. */
const OPTIONAL_SLOT_UNKNOWN = 99;

/** Auto-layout layer 0: explicit tiers (brief &lt; reals &lt; ghosts &lt; model). */
const LAYER0_ORDER_BRIEF = 1;
const LAYER0_REAL_OPTIONAL_BASE = 10;
const LAYER0_GHOST_BASE = 100;
const LAYER0_MODEL = 1000;
const LAYER0_FALLBACK = 500;

function optionalInputSlotIndex(type: string): number {
  const i = (OPTIONAL_INPUT_SLOTS as readonly string[]).indexOf(type);
  return i === -1 ? OPTIONAL_SLOT_UNKNOWN : i;
}

// ── Layout constants ────────────────────────────────────────────────

/** Node widths (must match the w-node / w-node-variant CSS tokens) */
const NODE_W_DEFAULT = 320;
const NODE_W_VARIANT = 480;

export const GRID_SIZE = 20;
const NODE_SPACING = 60;
const FALLBACK_H: Record<string, number> = {
  inputCard: 400,
  inputGhost: 272,
  incubator: 220,
  designSystem: 300,
  hypothesis: 440,
  preview: 400,
  model: 180,
};
export const DEFAULT_COL_GAP = 160;
export const MIN_COL_GAP = 80;
export const MAX_COL_GAP = 320;
/** Fallback Y coordinate when no existing nodes can be used as an anchor. */
const DEFAULT_CANVAS_Y = 300;

// ── Helpers ──────────────────────────────────────────────────────────

/** Get a node's measured height, or a reasonable estimate */
function nodeH(node: CanvasNode): number {
  const measured = node.measured?.height as number | undefined;
  if (measured != null) return measured;
  if (node.type === INPUT_GHOST_NODE_TYPE) return FALLBACK_H.inputGhost;
  if (INPUT_NODE_TYPES.has(node.type as CanvasNodeType)) return FALLBACK_H.inputCard;
  return FALLBACK_H[node.type as string] ?? 200;
}

/** Fallback sort for layer 0; input + model ordering is owned by `layoutTypeOrder` tiers, not this map. */
const TYPE_ORDER_LAYER: Record<string, number> = {
  incubator: 6,
  designSystem: 7,
  hypothesis: 8,
  preview: 9,
};

/**
 * Sort key for auto-layout layer 0: brief top, real optional inputs next (canonical order),
 * ghosts below reals, model last.
 */
export function layoutTypeOrder(n: CanvasNode): number {
  if (n.type === 'designBrief') return LAYER0_ORDER_BRIEF;
  if (n.type === INPUT_GHOST_NODE_TYPE) {
    const t = (n.data as InputGhostData).targetType;
    return LAYER0_GHOST_BASE + optionalInputSlotIndex(t ?? '');
  }
  if (n.type === 'model') return LAYER0_MODEL;
  if (
    n.type === 'researchContext' ||
    n.type === 'objectivesMetrics' ||
    n.type === 'designConstraints'
  ) {
    return LAYER0_REAL_OPTIONAL_BASE + optionalInputSlotIndex(n.type);
  }
  return TYPE_ORDER_LAYER[n.type as string] ?? LAYER0_FALLBACK;
}

/**
 * Strip ephemeral input ghosts and re-append placeholders for each optional input slot
 * not represented by a real node and not dismissed. Positions are placeholders; run auto-layout after.
 */
export function reconcileInputGhostNodes(
  nodes: WorkspaceNode[],
): WorkspaceNode[] {
  const base = nodes.filter((n) => n.type !== INPUT_GHOST_NODE_TYPE);
  const have = new Set(base.map((n) => n.type));
  const ghosts: WorkspaceNode[] = [];
  for (const slot of OPTIONAL_INPUT_SLOTS) {
    if (have.has(slot)) continue;
    ghosts.push({
      id: inputGhostStableId(slot),
      type: INPUT_GHOST_NODE_TYPE,
      position: { x: 0, y: 0 },
      data: { targetType: slot },
    });
  }
  return [...base, ...ghosts];
}

/** Reconcile optional-input placeholder ghosts (not persisted). */
export function reconcileEphemeralGhostNodes(
  nodes: WorkspaceNode[],
): WorkspaceNode[] {
  return reconcileInputGhostNodes(nodes);
}

function nodeWidth(node: CanvasNode): number {
  return node.type === 'preview' ? NODE_W_VARIANT : NODE_W_DEFAULT;
}

/** Compute column X positions from a given gap (4 columns: inputs → incubator → hypothesis → preview) */
export function columnX(gap: number) {
  const s = 0;
  const c = s + NODE_W_DEFAULT + gap;
  const h = c + NODE_W_DEFAULT + gap;
  const v = h + NODE_W_DEFAULT + gap;
  return { inputs: s, incubator: c, hypothesis: h, preview: v };
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
 * Model → Incubator: model lands in the inputs column.
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
  // Model and Design System are processing nodes — place in the incubator column
  if (type === 'model' || type === 'designSystem') {
    const processingNodes = existingNodes.filter((n) =>
      n.type === 'incubator' || n.type === 'designSystem' || n.type === 'model'
    );
    let y = 200;
    for (const pn of processingNodes) {
      y += nodeH(pn) + NODE_SPACING;
    }
    return snap({ x: col.incubator, y });
  }
  if (INPUT_NODE_TYPES.has(type)) {
    const inputNodes = existingNodes.filter((n) =>
      INPUT_NODE_TYPES.has(n.type as CanvasNodeType)
    );
    let y = 200;
    for (const inode of inputNodes) {
      y += nodeH(inode) + NODE_SPACING;
    }
    return snap({ x: col.inputs, y });
  }
  if (type === 'incubator') {
    const incubators = existingNodes.filter((n) => n.type === 'incubator');
    if (incubators.length === 0) return snap({ x: col.incubator, y: DEFAULT_CANVAS_Y });
    const lastY = Math.max(...incubators.map((n) => n.position.y + nodeH(n)));
    return snap({ x: col.incubator, y: lastY + NODE_SPACING });
  }
  if (type === 'hypothesis') {
    const hypNodes = existingNodes.filter((n) => n.type === 'hypothesis');
    let y = 200;
    for (const hn of hypNodes) {
      y += nodeH(hn) + NODE_SPACING;
    }
    return snap({ x: col.hypothesis, y });
  }
  return snap({ x: col.preview, y: DEFAULT_CANVAS_Y });
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

  // 2b. Force designSystem nodes to the same rank as incubator (processing column)
  //     DesignSystem has no incoming edges — only outgoing to hypotheses — so DFS gives rank 0.
  const compilerRank = Math.max(1, ...nodes
    .filter((n) => n.type === 'incubator')
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

  // 2d. Force disconnected preview nodes (archived/pinned) to the preview column rank
  //     Without edges, DFS assigns rank 0 which places them in the leftmost column.
  const previewRank = Math.max(0, ...nodes
    .filter((n) => n.type === 'preview' && (parents.get(n.id)?.length ?? 0) > 0)
    .map((n) => rank.get(n.id) ?? 0));
  if (previewRank > 0) {
    for (const n of nodes) {
      if (n.type === 'preview' && (parents.get(n.id)?.length ?? 0) === 0) {
        rank.set(n.id, previewRank);
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
  nonEmptyLayers[0].sort((a, b) => layoutTypeOrder(a) - layoutTypeOrder(b));

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
