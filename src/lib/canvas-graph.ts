import type { DesignSpec, ReferenceImage } from '../types/spec';
import type { GenerationResult } from '../types/provider';
import type { CritiqueInput } from './prompts/compiler-user';
import type { DesignSystemNodeData, CritiqueNodeData, VariantNodeData } from '../types/canvas-data';
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

// ── Design system inputs ────────────────────────────────────────────

export interface DesignSystemInputs {
  content: string | undefined;
  images: ReferenceImage[];
}

/**
 * Collect merged design system content and images from all DesignSystem nodes
 * connected upstream of the given target node.
 */
export function collectDesignSystemInputs(
  nodes: AnyNode[],
  edges: AnyEdge[],
  targetNodeId: string,
): DesignSystemInputs {
  const incomingEdges = edges.filter((e) => e.target === targetNodeId);
  const dsNodes = incomingEdges
    .map((e) => nodes.find((n) => n.id === e.source && n.type === 'designSystem'))
    .filter(Boolean) as AnyNode[];

  if (dsNodes.length === 0) return { content: undefined, images: [] };

  const parts = dsNodes
    .map((n) => {
      const data = n.data as DesignSystemNodeData;
      const t = data.title || 'Design System';
      const c = data.content || '';
      return c.trim() ? `## ${t}\n${c}` : '';
    })
    .filter(Boolean);

  return {
    content: parts.join('\n\n---\n\n') || undefined,
    images: dsNodes.flatMap((n) => (n.data as DesignSystemNodeData).images ?? []),
  };
}

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
  critiques: CritiqueInput[];
}

/**
 * Walk the graph from a compiler node to build all inputs
 * needed for compilation — a partial spec (connected sections only),
 * reference designs (from connected variant nodes), and critiques.
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
    (wiring.sectionNodeIds.length > 0 ||
      wiring.variantNodeIds.length > 0 ||
      wiring.critiqueNodeIds.length > 0)
  ) {
    const idSet = new Set<string>([
      ...wiring.sectionNodeIds,
      ...wiring.variantNodeIds,
      ...wiring.critiqueNodeIds,
    ]);
    connectedNodes = nodes.filter((n) => idSet.has(n.id));
  } else {
    const incomingEdges = edges.filter((e) => e.target === compilerId);
    const connectedNodeIds = new Set(incomingEdges.map((e) => e.source));
    connectedNodes = nodes.filter((n) => connectedNodeIds.has(n.id));
  }

  // Build partial spec: keep connected sections, blank out disconnected ones
  const connectedSectionIds = new Set<string>();
  for (const node of connectedNodes) {
    const sid = NODE_TYPE_TO_SECTION[node.type as CanvasNodeType];
    if (sid) connectedSectionIds.add(sid);
  }

  const partialSpec: DesignSpec = {
    ...spec,
    sections: Object.fromEntries(
      Object.entries(spec.sections).map(([sectionId, section]) => [
        sectionId,
        connectedSectionIds.has(sectionId)
          ? section
          : { ...section, content: '', images: [] as typeof section.images },
      ])
    ) as DesignSpec['sections'],
  };

  // Collect reference designs from connected variant nodes
  const referenceDesigns: { name: string; code: string }[] = [];
  const collectVariantCode = async (variantNode: AnyNode) => {
    const variantData = variantNode.data as VariantNodeData;
    if (variantNode.type === 'variant' && variantData.refId) {
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

  // Collect critiques from connected critique nodes
  const critiques: CritiqueInput[] = [];
  for (const node of connectedNodes) {
    if (node.type === 'critique') {
      const critiqueData = node.data as CritiqueNodeData;
      const critique: CritiqueInput = {
        title: critiqueData.title || 'Critique',
        strengths: critiqueData.strengths || '',
        improvements: critiqueData.improvements || '',
        direction: critiqueData.direction || '',
      };

      // Follow the critique's incoming edges to find the variant it references
      const critiqueInputEdges = edges.filter((e) => e.target === node.id);
      for (const e of critiqueInputEdges) {
        const sourceNode = nodes.find((n) => n.id === e.source);
        if (sourceNode?.type === 'variant' && (sourceNode.data as VariantNodeData).refId) {
          const result = results.find((r) => r.id === (sourceNode.data as VariantNodeData).refId);
          if (result) {
            const code = result.code ?? (await loadCode(result.id));
            if (code) {
              critique.variantCode = code;
            }
          }
        }
      }

      critiques.push(critique);
    }
  }

  return { partialSpec, referenceDesigns, critiques };
}

