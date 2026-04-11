import type { DesignSpec } from '../types/spec';
import type { GenerationResult } from '../types/provider';
import { getPreviewNodeData } from './canvas-node-data';
import { loadCode } from '../services/idb-storage';
import { INPUT_NODE_TYPES } from '../constants/canvas';
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

// ── Incubate inputs ─────────────────────────────────────────────────

export interface IncubateInputs {
  partialSpec: DesignSpec;
  referenceDesigns: { name: string; code: string }[];
}

/**
 * Walk the graph from an incubator node to build all inputs
 * needed for incubation — spec sections wired to this incubator **or** non-empty in the shared
 * spec store, and reference designs (from connected preview nodes).
 *
 * Async because generated code is now stored in IndexedDB.
 */
export async function buildIncubateInputs(
  nodes: AnyNode[],
  edges: AnyEdge[],
  spec: DesignSpec,
  incubatorId: string,
  results: GenerationResult[],
  wiring?: DomainIncubatorWiring | null,
): Promise<IncubateInputs> {
  let connectedNodes: AnyNode[];
  if (
    wiring &&
    (wiring.inputNodeIds.length > 0 || wiring.previewNodeIds.length > 0)
  ) {
    const idSet = new Set<string>([
      ...wiring.inputNodeIds,
      ...wiring.previewNodeIds,
    ]);
    connectedNodes = nodes.filter((n) => idSet.has(n.id));
  } else {
    const incomingEdges = edges.filter((e) => e.target === incubatorId);
    const connectedNodeIds = new Set(incomingEdges.map((e) => e.source));
    connectedNodes = nodes.filter((n) => connectedNodeIds.has(n.id));
  }

  // Input node types wired to this incubator (graph or domain wiring); each maps to a spec facet id.
  const connectedSectionIds = new Set<string>();
  for (const node of connectedNodes) {
    const sid = NODE_TYPE_TO_SECTION[node.type as CanvasNodeType];
    if (sid) connectedSectionIds.add(sid);
  }

  /**
   * Include spec content when the section is wired OR when the user filled it (or added images)
   * in the global spec store. Previously only wired sections were kept — the default canvas wires
   * only the design brief, so Research / Objectives / Constraints looked empty in incubator logs
   * even though input nodes were filled.
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

  // Collect reference designs from connected preview nodes
  const referenceDesigns: { name: string; code: string }[] = [];
  const collectPreviewCode = async (previewNode: AnyNode) => {
    const previewData = getPreviewNodeData(previewNode);
    if (previewNode.type === 'preview' && previewData?.refId) {
      const result = results.find((r) => r.id === previewData.refId);
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
    // Direct preview → incubator
    codePromises.push(collectPreviewCode(node));

    // Indirect preview → input → incubator (follow edges into input nodes)
    if (INPUT_NODE_TYPES.has(node.type as CanvasNodeType)) {
      const sectionInputEdges = edges.filter((e) => e.target === node.id);
      for (const e of sectionInputEdges) {
        const sourceNode = nodes.find((n) => n.id === e.source);
        if (sourceNode) codePromises.push(collectPreviewCode(sourceNode));
      }
    }
  }
  await Promise.all(codePromises);

  return { partialSpec, referenceDesigns };
}

