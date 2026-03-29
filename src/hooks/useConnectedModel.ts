import { useMemo } from 'react';
import { useCanvasStore } from '../stores/canvas-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { useProviderModels } from './useProviderModels';
import { DEFAULT_COMPILER_PROVIDER } from '../lib/constants';
import type { ModelNodeData } from '../types/canvas-data';
import { findFirstUpstreamModelNodeId } from '../workspace/graph-queries';

/**
 * Reads provider/model config from a connected Model node.
 *
 * Prefers domain bindings (incubator / hypothesis); falls back to graph edges.
 *
 * Uses primitive Zustand selectors to avoid useSyncExternalStore infinite loops.
 */
export function useConnectedModel(nodeId: string) {
  const domainModelNodeId = useWorkspaceDomainStore((s) => {
    const fromIncubator = s.incubatorModelNodeIds[nodeId]?.[0];
    if (fromIncubator) return fromIncubator;
    return s.hypotheses[nodeId]?.modelNodeIds[0] ?? null;
  });

  const graphModelNodeId = useCanvasStore((s) =>
    findFirstUpstreamModelNodeId(nodeId, { nodes: s.nodes, edges: s.edges }),
  );

  const modelNodeId = domainModelNodeId ?? graphModelNodeId;

  // Read primitive values from Model node data (stable selectors).
  // Fall back to DEFAULT_COMPILER_PROVIDER when the Model node exists
  // but hasn't had its provider explicitly set yet — matches the
  // fallback in useNodeProviderModel used by ModelNode itself.
  const providerId = useCanvasStore(
    (s) => {
      if (!modelNodeId) return null;
      const data = s.nodes.find((n) => n.id === modelNodeId)?.data as ModelNodeData | undefined;
      return data?.providerId || DEFAULT_COMPILER_PROVIDER;
    },
  );

  const modelId = useCanvasStore(
    (s) => {
      if (!modelNodeId) return null;
      const data = s.nodes.find((n) => n.id === modelNodeId)?.data as ModelNodeData | undefined;
      return data?.modelId || null;
    },
  );

  const { data: models } = useProviderModels(providerId ?? '');

  const supportsVision = useMemo(
    () => models?.find((m) => m.id === modelId)?.supportsVision ?? false,
    [models, modelId],
  );

  const supportsReasoning = useMemo(
    () => models?.find((m) => m.id === modelId)?.supportsReasoning ?? false,
    [models, modelId],
  );

  return {
    providerId,
    modelId,
    supportsVision,
    supportsReasoning,
    isConnected: modelNodeId !== null,
  };
}
