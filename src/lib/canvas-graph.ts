import type { DesignSpec } from '../types/spec';
import type { GenerationResult } from '../types/provider';
import { getVariantNodeData } from './canvas-node-data';
import { loadCode } from '../services/idb-storage';
import { SECTION_NODE_TYPES } from '../lib/canvas-layout';
import {
  NODE_TYPE_TO_SECTION,
  type CanvasNodeType,
  type WorkspaceEdge,
  type WorkspaceNode,
} from '../types/workspace-graph';
import type { DomainIncubatorWiring } from '../types/workspace-domain';

type AnyNode = WorkspaceNode;
type AnyEdge = WorkspaceEdge;

// ── Lineage computation ─────────────────────────────────────────────

export interface LineageResult {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/**
 * Walk the graph bidirectionally from a selected node to find all
 * connected ancestors and descendants (the "lineage").
 */
export function computeLineage(
  edges: AnyEdge[],
  selectedNodeId: string,
): LineageResult {
  const nodeIds = new Set<string>([selectedNodeId]);
  const edgeIds = new Set<string>();

  // Full connected-component walk: from each discovered node, traverse
  // both directions so sibling inputs to shared targets are included.
  const queue = [selectedNodeId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const e of edges) {
      if (e.target === current && !nodeIds.has(e.source)) {
        edgeIds.add(e.id);
        nodeIds.add(e.source);
        queue.push(e.source);
      }
      if (e.source === current && !nodeIds.has(e.target)) {
        edgeIds.add(e.id);
        nodeIds.add(e.target);
        queue.push(e.target);
      }
      if (e.source === current || e.target === current) {
        edgeIds.add(e.id);
      }
    }
  }

  return { nodeIds, edgeIds };
}

// ── Compile inputs ──────────────────────────────────────────────────

export interface CompileInputs {
  partialSpec: DesignSpec;
  referenceDesigns: { name: string; code: string }[];
}

/**
 * Walk the graph from a compiler node to build all inputs
 * needed for compilation — spec sections wired to this compiler **or** non-empty in the shared
 * spec store, and reference designs (from connected variant nodes).
 *
 * Async because generated code is now stored in IndexedDB.
 */
export async function buildCompileInputs(
  nodes: AnyNode[],
  edges: AnyEdge[],
  spec: DesignSpec,
  compilerId: string,
  results: GenerationResult[],
  wiring?: DomainIncubatorWiring | null,
): Promise<CompileInputs> {
  let connectedNodes: AnyNode[];
  if (
    wiring &&
    (wiring.sectionNodeIds.length > 0 || wiring.variantNodeIds.length > 0)
  ) {
    const idSet = new Set<string>([
      ...wiring.sectionNodeIds,
      ...wiring.variantNodeIds,
    ]);
    connectedNodes = nodes.filter((n) => idSet.has(n.id));
  } else {
    const incomingEdges = edges.filter((e) => e.target === compilerId);
    const connectedNodeIds = new Set(incomingEdges.map((e) => e.source));
    connectedNodes = nodes.filter((n) => connectedNodeIds.has(n.id));
  }

  // Section node types wired to this compiler (graph or domain wiring).
  const connectedSectionIds = new Set<string>();
  for (const node of connectedNodes) {
    const sid = NODE_TYPE_TO_SECTION[node.type as CanvasNodeType];
    if (sid) connectedSectionIds.add(sid);
  }

  /**
   * Include spec content when the section is wired OR when the user filled it (or added images)
   * in the global spec store. Previously only wired sections were kept — the default canvas wires
   * only the design brief, so Research / Objectives / Constraints looked empty in incubator logs
   * even though section nodes were filled.
   */
  const includeSection = (sectionId: string, section: DesignSpec['sections'][string]): boolean => {
    if (connectedSectionIds.has(sectionId)) return true;
    if (section.content.trim().length > 0) return true;
    if (section.images.length > 0) return true;
    return false;
  };

  const partialSpec: DesignSpec = {
    ...spec,
    sections: Object.fromEntries(
      Object.entries(spec.sections).map(([sectionId, section]) => [
        sectionId,
        includeSection(sectionId, section)
          ? section
          : { ...section, content: '', images: [] as typeof section.images },
      ])
    ) as DesignSpec['sections'],
  };

  // Collect reference designs from connected variant nodes
  const referenceDesigns: { name: string; code: string }[] = [];
  const collectVariantCode = async (variantNode: AnyNode) => {
    const variantData = getVariantNodeData(variantNode);
    if (variantNode.type === 'variant' && variantData?.refId) {
      const result = results.find((r) => r.id === variantData.refId);
      if (result) {
        // Try in-memory code first (during active generation), then IndexedDB
        const code = result.code ?? (await loadCode(result.id));
        if (code) {
          referenceDesigns.push({
            name: result.metadata?.model ?? 'Previous Design',
            code,
          });
        }
      }
    }
  };

  const codePromises: Promise<void>[] = [];
  for (const node of connectedNodes) {
    // Direct variant → compiler
    codePromises.push(collectVariantCode(node));

    // Indirect variant → section → compiler (follow edges into section nodes)
    if (SECTION_NODE_TYPES.has(node.type as CanvasNodeType)) {
      const sectionInputEdges = edges.filter((e) => e.target === node.id);
      for (const e of sectionInputEdges) {
        const sourceNode = nodes.find((n) => n.id === e.source);
        if (sourceNode) codePromises.push(collectVariantCode(sourceNode));
      }
    }
  }
  await Promise.all(codePromises);

  return { partialSpec, referenceDesigns };
}

