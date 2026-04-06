/**
 * Hydrate workspace domain from a canvas node/edge snapshot (load / layout).
 * Lives outside `workspace-domain-store` so the domain module stays free of canvas wiring rules.
 */
import { NODE_TYPES } from '../constants/canvas';
import { DEFAULT_INCUBATOR_PROVIDER } from '../lib/constants';
import { getDesignSystemNodeData, getModelNodeData } from '../lib/canvas-node-data';
import type { CanvasNodeType } from '../types/workspace-graph';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { applyHydrateEdgeRules } from './edge-domain-rules';
import { snapshotNodeToWorkspace } from './graph-queries';

/** Hydrate domain from an existing canvas snapshot (best-effort, idempotent). */
export function hydrateDomainFromCanvasGraph(input: {
  nodes: { id: string; type: CanvasNodeType; data: Record<string, unknown> }[];
  edges: { source: string; target: string }[];
}): void {
  const store = useWorkspaceDomainStore.getState();

  for (const n of input.nodes) {
    if (n.type === NODE_TYPES.MODEL) {
      const d = getModelNodeData(snapshotNodeToWorkspace(n));
      if (d) {
        store.upsertModelProfile(n.id, {
          providerId: d.providerId || DEFAULT_INCUBATOR_PROVIDER,
          modelId: d.modelId || '',
          title: d.title,
          thinkingLevel: d.thinkingLevel ?? 'minimal',
        });
      }
    }
    if (n.type === NODE_TYPES.DESIGN_SYSTEM) {
      const d = getDesignSystemNodeData(snapshotNodeToWorkspace(n));
      if (d) {
        store.upsertDesignSystem(n.id, {
          title: d.title ?? '',
          content: d.content ?? '',
          images: d.images ?? [],
          providerMigration: d.providerId,
          modelMigration: d.modelId,
        });
      }
    }
  }

  const compilerHypFirst = (e: { source: string; target: string }) => {
    const src = input.nodes.find((node) => node.id === e.source);
    const tgt = input.nodes.find((node) => node.id === e.target);
    return src?.type === NODE_TYPES.INCUBATOR && tgt?.type === NODE_TYPES.HYPOTHESIS;
  };
  const orderedEdges = [
    ...input.edges.filter(compilerHypFirst),
    ...input.edges.filter((e) => !compilerHypFirst(e)),
  ];

  for (const e of orderedEdges) {
    const src = input.nodes.find((node) => node.id === e.source);
    const tgt = input.nodes.find((node) => node.id === e.target);
    if (!src || !tgt) continue;

    applyHydrateEdgeRules({ store, input, src, tgt });
  }
}
