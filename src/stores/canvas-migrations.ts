import { DEFAULT_COL_GAP } from '../lib/canvas-layout';
import { STORAGE_KEYS } from '../lib/storage-keys';
import { EDGE_TYPES, EDGE_STATUS, NODE_TYPES } from '../constants/canvas';
import { dedupeEdgesById } from '../lib/canvas-connections';

/** Safely read and parse a localStorage JSON entry. Returns null on any failure. */
function readLocalStorageJson(key: string): unknown {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[canvas-migrations] Failed to parse localStorage key "${key}"`, e);
    return null;
  }
}

const FRESH_STATE = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 0.85 },
  showMiniMap: true,
  colGap: DEFAULT_COL_GAP,
};

// ── Per-version migration functions ──────────────────────────────────

/** v2 → v3: fix stale legacy `compiler` nodes (historical type string before node-type renames). */
function migrateV2ToV3(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];
  return {
    ...s,
    nodes: nodes.map((n) => ({
      ...n,
      type: n.type === 'compiler' ? 'designer' : n.type,
      id: n.id === 'compiler-node' ? 'generator-node' : n.id,
    })),
    edges: edges.map((e) => ({
      ...e,
      source: e.source === 'compiler-node' ? 'generator-node' : e.source,
      target: e.target === 'compiler-node' ? 'generator-node' : e.target,
      id: typeof e.id === 'string' ? e.id.replace('compiler', 'designer') : e.id,
    })),
  };
}

/** v5 → v6: rename 'generator' node type to 'designer' */
function migrateV5ToV6(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];
  return {
    ...s,
    nodes: nodes.map((n) => ({
      ...n,
      type: n.type === 'generator' ? 'designer' : n.type,
    })),
    edges: edges.map((e) => ({
      ...e,
      id: typeof e.id === 'string' ? e.id.replace('generator', 'designer') : e.id,
    })),
  };
}

/** v6 → v7: add variantStrategyId to variant nodes from generation store */
function migrateV6ToV7(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];

  const genParsed = readLocalStorageJson(STORAGE_KEYS.GENERATION) as Record<string, unknown> | null;
  const genResults: Array<Record<string, unknown>> =
    (genParsed?.state as Record<string, unknown> | undefined)?.results as Array<Record<string, unknown>> ?? [];

  const resultById = new Map<string, string>();
  for (const r of genResults) {
    if (r.id && r.variantStrategyId) {
      resultById.set(r.id as string, r.variantStrategyId as string);
    }
  }

  return {
    ...s,
    nodes: nodes.map((n) => {
      if (n.type === 'variant' && n.data) {
        const data = n.data as Record<string, unknown>;
        if (!data.variantStrategyId && data.refId) {
          const vsId = resultById.get(data.refId as string);
          if (vsId) return { ...n, data: { ...data, variantStrategyId: vsId } };
        }
      }
      return n;
    }),
  };
}

/** v8 → v9: remove designer nodes (merged into hypothesis), rebuild hyp→variant edges */
function migrateV8ToV9(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];
  const designerIds = new Set(nodes.filter((n) => n.type === 'designer').map((n) => n.id as string));

  const newEdges: Array<Record<string, unknown>> = [];
  const hypothesisNodes = nodes.filter((n) => n.type === 'hypothesis');
  const variantNodes = nodes.filter((n) => n.type === 'variant');
  for (const hyp of hypothesisNodes) {
    const hypRefId = (hyp.data as Record<string, unknown> | undefined)?.refId as string | undefined;
    if (!hypRefId) continue;
    for (const v of variantNodes) {
      if ((v.data as Record<string, unknown> | undefined)?.variantStrategyId === hypRefId) {
        newEdges.push({ id: `e-${hyp.id as string}-${v.id as string}`, source: hyp.id as string, target: v.id as string, type: EDGE_TYPES.DATA_FLOW });
      }
    }
  }

  return {
    ...s,
    nodes: nodes.filter((n) => n.type !== 'designer'),
    edges: [
      ...edges.filter((e) => !designerIds.has(e.source as string) && !designerIds.has(e.target as string)),
      ...newEdges,
    ],
  };
}

/** v9 → v10: ensure hypothesis→variant edges exist */
function migrateV9ToV10(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];

  const existingKeys = new Set<string>();
  for (const e of edges) existingKeys.add(`${e.source as string}→${e.target as string}`);

  const newEdges: Array<Record<string, unknown>> = [];
  const hypothesisNodes = nodes.filter((n) => n.type === 'hypothesis');
  const variantNodes = nodes.filter((n) => n.type === 'variant');
  for (const hyp of hypothesisNodes) {
    const hypRefId = (hyp.data as Record<string, unknown> | undefined)?.refId as string | undefined;
    if (!hypRefId) continue;
    for (const v of variantNodes) {
      if ((v.data as Record<string, unknown> | undefined)?.variantStrategyId === hypRefId) {
        const key = `${hyp.id as string}→${v.id as string}`;
        if (!existingKeys.has(key)) {
          newEdges.push({ id: `e-${hyp.id as string}-${v.id as string}`, source: hyp.id as string, target: v.id as string, type: EDGE_TYPES.DATA_FLOW });
        }
      }
    }
  }

  return newEdges.length > 0 ? { ...s, edges: [...edges, ...newEdges] } : s;
}

/** Read design-system section data from the spec store in localStorage */
function readDesignSystemSection(storageKey: string): { content: string; images: unknown[] } {
  const specParsed = readLocalStorageJson(storageKey) as Record<string, unknown> | null;
  const spec = (specParsed?.state as Record<string, unknown> | undefined)?.spec as Record<string, unknown> | undefined;
  const dsData = (spec?.sections as Record<string, unknown> | undefined)?.['design-system'] as Record<string, unknown> | undefined;
  return {
    content: (dsData?.content as string | undefined) || '',
    images: (dsData?.images as unknown[] | undefined) || [],
  };
}

/** v10 → v11: designSystem is now self-contained (content in node.data, not spec store) */
function migrateV10ToV11(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];
  const { content: dsContent, images: dsImages } = readDesignSystemSection(STORAGE_KEYS.ACTIVE_CANVAS);

  const updatedNodes = nodes.map((n) => {
    if (n.type === 'designSystem') {
      const existingData = (n.data as Record<string, unknown>) || {};
      return { ...n, data: { ...existingData, title: 'Design System', content: dsContent, images: dsImages } };
    }
    return n;
  });

  const newEdges: Array<Record<string, unknown>> = [];
  const dsNodeIds = updatedNodes.filter((n) => n.type === 'designSystem').map((n) => n.id as string);
  const hypNodeIds = updatedNodes.filter((n) => n.type === 'hypothesis').map((n) => n.id as string);
  for (const dsId of dsNodeIds) {
    for (const hypId of hypNodeIds) {
      newEdges.push({ id: `edge-${dsId}-to-${hypId}`, source: dsId, target: hypId, type: EDGE_TYPES.DATA_FLOW });
    }
  }

  return { ...s, nodes: updatedNodes, edges: [...edges, ...newEdges] };
}

/** v11 → v12: re-attempt designSystem data recovery (v10→v11 may have run before spec hydration) */
function migrateV11ToV12(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];

  const hasMissingContent = nodes.some((n) => {
    if (n.type !== 'designSystem') return false;
    return !((n.data as Record<string, unknown>) || {}).content;
  });

  if (!hasMissingContent) return s;

  const { content: dsContent, images: dsImages } = readDesignSystemSection(STORAGE_KEYS.ACTIVE_CANVAS);
  if (!dsContent && dsImages.length === 0) return s;

  return {
    ...s,
    nodes: nodes.map((n) => {
      if (n.type !== 'designSystem') return n;
      const data = (n.data as Record<string, unknown>) || {};
      if (data.content) return n;
      return { ...n, data: { ...data, title: data.title || 'Design System', content: dsContent, images: dsImages } };
    }),
  };
}

/** v12 → v13: extract inline providerId/modelId into dedicated Model nodes */
function migrateV12ToV13(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];

  const PROCESSING_TYPES = new Set(['incubator', 'hypothesis', 'designSystem']);
  const nodesWithModel: Array<{ node: Record<string, unknown>; providerId: string; modelId: string }> = [];
  for (const n of nodes) {
    if (!PROCESSING_TYPES.has(n.type as string)) continue;
    const data = (n.data as Record<string, unknown>) || {};
    const pid = data.providerId as string | undefined;
    const mid = data.modelId as string | undefined;
    if (pid && mid) nodesWithModel.push({ node: n, providerId: pid, modelId: mid });
  }

  if (nodesWithModel.length === 0) return s;

  const combos = new Map<string, { providerId: string; modelId: string; targetIds: string[] }>();
  for (const { node, providerId, modelId } of nodesWithModel) {
    const key = `${providerId}::${modelId}`;
    if (!combos.has(key)) combos.set(key, { providerId, modelId, targetIds: [] });
    combos.get(key)!.targetIds.push(node.id as string);
  }

  const newModelNodes: Array<Record<string, unknown>> = [];
  const newEdges: Array<Record<string, unknown>> = [];

  let modelIdx = 0;
  for (const [, combo] of combos) {
    const modelNodeId = `model-migrated-${modelIdx++}`;
    const shortName = combo.modelId.split('/').pop() ?? combo.modelId;
    const label = `${combo.providerId} / ${shortName}`;

    const targetNodes = nodes.filter((n) => combo.targetIds.includes(n.id as string));
    const avgY = targetNodes.length > 0
      ? targetNodes.reduce((sum, n) => sum + ((n.position as Record<string, number>)?.y ?? 300), 0) / targetNodes.length
      : 300;
    const minX = targetNodes.length > 0
      ? Math.min(...targetNodes.map((n) => (n.position as Record<string, number>)?.x ?? 0))
      : 0;

    newModelNodes.push({
      id: modelNodeId,
      type: 'model',
      position: { x: Math.max(0, minX - 400), y: avgY },
      data: { title: label, providerId: combo.providerId, modelId: combo.modelId },
    });

    for (const tid of combo.targetIds) {
      newEdges.push({ id: `edge-${modelNodeId}-to-${tid}`, source: modelNodeId, target: tid, type: EDGE_TYPES.DATA_FLOW, data: { status: EDGE_STATUS.IDLE } });
    }
  }

  const updatedNodes = nodes.map((n) => {
    if (!PROCESSING_TYPES.has(n.type as string)) return n;
    const data = { ...((n.data as Record<string, unknown>) || {}) };
    delete data.providerId;
    delete data.modelId;
    return { ...n, data };
  });

  return { ...s, nodes: [...updatedNodes, ...newModelNodes], edges: [...edges, ...newEdges] };
}

/** v13 → v14: move hypothesis `agentMode` onto incoming Model nodes */
function migrateV13ToV14(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];

  const hypMode = new Map<string, 'single' | 'agentic'>();
  for (const n of nodes) {
    if (n.type !== 'hypothesis') continue;
    const data = (n.data as Record<string, unknown>) || {};
    const am = data.agentMode as 'single' | 'agentic' | undefined;
    if (am) hypMode.set(n.id as string, am);
  }

  const modelAgentMode = new Map<string, 'single' | 'agentic'>();
  for (const e of edges) {
    const mode = hypMode.get(e.target as string);
    if (!mode) continue;
    const src = nodes.find((m) => m.id === e.source && m.type === 'model');
    if (!src) continue;
    const mid = src.id as string;
    if (!modelAgentMode.has(mid)) modelAgentMode.set(mid, mode);
  }

  return {
    ...s,
    nodes: nodes.map((n) => {
      if (n.type === 'hypothesis') {
        const data = { ...((n.data as Record<string, unknown>) || {}) };
        delete data.agentMode;
        return { ...n, data };
      }
      if (n.type === 'model') {
        const mode = modelAgentMode.get(n.id as string);
        if (!mode) return n;
        const data = { ...((n.data as Record<string, unknown>) || {}) };
        if (data.agentMode == null) data.agentMode = mode;
        return { ...n, data };
      }
      return n;
    }),
  };
}

/** v14 → v15: hypothesis owns `agentMode`; each model owns `thinkingLevel` */
function migrateV14ToV15(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];

  const hypIncomingModels = new Map<string, string[]>();
  for (const e of edges) {
    const srcId = e.source as string;
    const tgtId = e.target as string;
    const src = nodes.find((n) => n.id === srcId);
    if (!src || src.type !== 'model') continue;
    const tgt = nodes.find((n) => n.id === tgtId);
    if (!tgt || tgt.type !== 'hypothesis') continue;
    const list = hypIncomingModels.get(tgtId) ?? [];
    list.push(srcId);
    hypIncomingModels.set(tgtId, list);
  }

  const hypAgentMode = new Map<string, 'single' | 'agentic'>();
  const modelThinkingFromHyp = new Map<string, string>();

  for (const n of nodes) {
    if (n.type !== 'hypothesis') continue;
    const hid = n.id as string;
    const data = (n.data as Record<string, unknown>) || {};
    const tl = (data.thinkingLevel as string | undefined) ?? 'minimal';

    const mids = hypIncomingModels.get(hid) ?? [];
    const modes: ('single' | 'agentic')[] = [];
    for (const mid of mids) {
      const mnode = nodes.find((x) => x.id === mid && x.type === 'model');
      if (!mnode) continue;
      const md = (mnode.data as Record<string, unknown>) || {};
      const am = md.agentMode as 'single' | 'agentic' | undefined;
      if (am) modes.push(am);
    }
    const aggregated =
      modes.some((m) => m === 'agentic') ? 'agentic' : 'single';
    hypAgentMode.set(hid, aggregated);

    for (const mid of mids) {
      modelThinkingFromHyp.set(mid, tl);
    }
  }

  return {
    ...s,
    nodes: nodes.map((n) => {
      if (n.type === 'hypothesis') {
        const data = { ...((n.data as Record<string, unknown>) || {}) };
        delete data.thinkingLevel;
        data.agentMode = hypAgentMode.get(n.id as string) ?? 'single';
        return { ...n, data };
      }
      if (n.type === 'model') {
        const data = { ...((n.data as Record<string, unknown>) || {}) };
        delete data.agentMode;
        const tl = modelThinkingFromHyp.get(n.id as string) ?? 'minimal';
        data.thinkingLevel = tl;
        return { ...n, data };
      }
      return n;
    }),
  };
}

/** v15 → v16: remove Critique nodes (feature retired) and edges touching them */
function migrateV15ToV16(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];
  const removed = new Set<string>();
  for (const n of nodes) {
    if (n.type === 'critique') removed.add(n.id as string);
  }
  const nextNodes = nodes.filter((n) => n.type !== 'critique');
  const nextEdges = edges.filter((e) => {
    const src = e.source as string;
    const tgt = e.target as string;
    return !removed.has(src) && !removed.has(tgt);
  });
  return { ...s, nodes: nextNodes, edges: nextEdges };
}

/** v16 → v17: strip ephemeral section ghosts if any ever leaked into storage */
function migrateV16ToV17(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  return {
    ...s,
    nodes: nodes.filter((n) => n.type !== 'sectionGhost' && n.type !== 'inputGhost'),
  };
}

/** v17 → v18: remove ghost-dismiss persistence now that ghost cards are permanent affordances. */
function migrateV17ToV18(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...s };
  delete out.dismissedSectionGhostSlots;
  return out;
}

/** v18 → v19: remove legacy ghost-dismiss persistence. */
function migrateV18ToV19(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...s };
  delete out.dismissedSectionGhostSlots;
  return out;
}

/** v19 → v20: rename node type 'variant' → 'preview', node data variantStrategyId → strategyId */
function migrateV19ToV20(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  return {
    ...s,
    nodes: nodes.map((n) => {
      if (n.type === 'variant') {
        const data = (n.data as Record<string, unknown>) || {};
        const { variantStrategyId, ...rest } = data;
        return {
          ...n,
          type: 'preview',
          data: { ...rest, ...(variantStrategyId != null ? { strategyId: variantStrategyId } : {}) },
        };
      }
      return n;
    }),
  };
}

/** v20 → v21: rename node type `compiler` → `incubator` (terminology; same processing role). */
function migrateV20ToV21(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  return {
    ...s,
    nodes: nodes.map((n) => (n.type === 'compiler' ? { ...n, type: 'incubator' } : n)),
  };
}

const LEGACY_GHOST_ID_PREFIX = 'ghost-section-';
const INPUT_GHOST_ID_PREFIX = 'ghost-input-';

/** v21 → v22: input-ghost node type/id prefix; persist keys for dismissed slots. */
function migrateV21ToV22(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const idRewrites = new Map<string, string>();
  for (const n of nodes) {
    const rawId = n.id as string;
    if (rawId.startsWith(LEGACY_GHOST_ID_PREFIX)) {
      idRewrites.set(rawId, INPUT_GHOST_ID_PREFIX + rawId.slice(LEGACY_GHOST_ID_PREFIX.length));
    }
  }

  const nextNodes = nodes.map((n) => {
    const rawId = n.id as string;
    const id = idRewrites.get(rawId) ?? rawId;
    const type = n.type === 'sectionGhost' ? 'inputGhost' : n.type;
    return { ...n, id, type };
  });

  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];
  const nextEdges = edges.map((e) => {
    const src = e.source as string;
    const tgt = e.target as string;
    return {
      ...e,
      source: idRewrites.get(src) ?? src,
      target: idRewrites.get(tgt) ?? tgt,
    };
  });

  const out: Record<string, unknown> = { ...s };
  delete out.dismissedInputGhostSlots;
  delete out.dismissedSectionGhostSlots;
  delete out.sectionGhostToolbarNudge;
  delete out.inputGhostToolbarNudge;
  out.nodes = nextNodes;
  out.edges = nextEdges;
  return out;
}

/** v22 → v23: hypothesis `agentMode` removed — designing is always agentic; settings live in workspace domain. */
function migrateV22ToV23(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  return {
    ...s,
    nodes: nodes.map((n) => {
      if (n.type !== 'hypothesis') return n;
      const data = { ...((n.data as Record<string, unknown>) || {}) };
      delete data.agentMode;
      return { ...n, data };
    }),
  };
}

/** v23 → v24: remove unused `showGrid` (toggle never affected rendering). */
function migrateV23ToV24(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...s };
  delete out.showGrid;
  return out;
}

/** v24 → v25: at most one model→hypothesis edge per hypothesis (keep first in edge order). */
function migrateV24ToV25(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const nodeById = new Map(nodes.map((n) => [n.id as string, n]));
  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];
  const hypHasModel = new Set<string>();
  const nextEdges: Array<Record<string, unknown>> = [];
  for (const e of edges) {
    const src = e.source as string;
    const tgt = e.target as string;
    const srcNode = nodeById.get(src);
    const tgtNode = nodeById.get(tgt);
    if (
      srcNode &&
      tgtNode &&
      srcNode.type === NODE_TYPES.MODEL &&
      tgtNode.type === NODE_TYPES.HYPOTHESIS
    ) {
      if (hypHasModel.has(tgt)) continue;
      hypHasModel.add(tgt);
    }
    nextEdges.push(e);
  }
  return { ...s, edges: nextEdges };
}

/** v25 → v26: dedupe edges by `id` (fixes duplicate React keys from merged/hydrated state). */
function migrateV25ToV26(s: Record<string, unknown>): Record<string, unknown> {
  const edges = (s.edges as Array<{ id: string }>) ?? [];
  return { ...s, edges: dedupeEdgesById(edges) };
}

/** v26 → v27: remove deprecated `hypothesisGhost` nodes and any edges touching them. */
function migrateV26ToV27(s: Record<string, unknown>): Record<string, unknown> {
  const nodes = (s.nodes as Array<Record<string, unknown>>) ?? [];
  const edges = (s.edges as Array<Record<string, unknown>>) ?? [];
  const ghostIds = new Set(
    nodes.filter((n) => n.type === 'hypothesisGhost').map((n) => String(n.id)),
  );
  return {
    ...s,
    nodes: nodes.filter((n) => n.type !== 'hypothesisGhost'),
    edges: edges.filter(
      (e) => !ghostIds.has(String(e.source)) && !ghostIds.has(String(e.target)),
    ),
  };
}

/** v27 → v28: auto layout is implicit canvas behavior, not persisted state. */
function migrateV27ToV28(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...s };
  delete out.autoLayout;
  return out;
}

/** v28 → v29: ghost input cards are no longer dismissible. */
function migrateV28ToV29(s: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...s };
  delete out.dismissedInputGhostSlots;
  delete out.dismissedSectionGhostSlots;
  return out;
}

// ── Top-level migration runner ────────────────────────────────────────

/**
 * Run all canvas store migrations from `fromVersion` → current.
 */
export function migrateCanvasState(
  state: unknown,
  fromVersion: number,
): Record<string, unknown> {
  // v0/v1 → v4: too old to migrate incrementally, reset
  if (fromVersion < 2) return { ...FRESH_STATE };

  let s = state as Record<string, unknown>;

  if (fromVersion < 3) s = migrateV2ToV3(s);

  // v3 → v4: reset canvas for multi-compiler/generator support
  if (fromVersion < 4) return { ...FRESH_STATE };

  if (fromVersion < 6) s = migrateV5ToV6(s);
  if (fromVersion < 7) s = migrateV6ToV7(s);
  // v7 → v8: provider/model/format now stored in node data (no transform needed)
  if (fromVersion < 9) s = migrateV8ToV9(s);
  if (fromVersion < 10) s = migrateV9ToV10(s);
  if (fromVersion < 11) s = migrateV10ToV11(s);
  if (fromVersion < 12) s = migrateV11ToV12(s);
  if (fromVersion < 13) s = migrateV12ToV13(s);
  if (fromVersion < 14) s = migrateV13ToV14(s);
  if (fromVersion < 15) s = migrateV14ToV15(s);
  if (fromVersion < 16) s = migrateV15ToV16(s);
  if (fromVersion < 17) s = migrateV16ToV17(s);
  if (fromVersion < 18) s = migrateV17ToV18(s);
  if (fromVersion < 19) s = migrateV18ToV19(s);
  if (fromVersion < 20) s = migrateV19ToV20(s);
  if (fromVersion < 21) s = migrateV20ToV21(s);
  if (fromVersion < 22) s = migrateV21ToV22(s);
  if (fromVersion < 23) s = migrateV22ToV23(s);
  if (fromVersion < 24) s = migrateV23ToV24(s);
  if (fromVersion < 25) s = migrateV24ToV25(s);
  if (fromVersion < 26) s = migrateV25ToV26(s);
  if (fromVersion < 27) s = migrateV26ToV27(s);
  if (fromVersion < 28) s = migrateV27ToV28(s);
  if (fromVersion < 29) s = migrateV28ToV29(s);

  return s;
}
