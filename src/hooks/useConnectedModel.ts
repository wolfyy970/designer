import { useMemo } from 'react';
import { useCanvasStore } from '../stores/canvas-store';
import { useWorkspaceDomainStore } from '../stores/workspace-domain-store';
import { LOCKDOWN_MODEL_ID, LOCKDOWN_PROVIDER_ID } from '../lib/lockdown-model';
import { useAppConfig } from './useAppConfig';
import { useProviderModels } from './useProviderModels';
import { DEFAULT_COMPILER_PROVIDER } from '../lib/constants';
import { getModelNodeData } from '../lib/canvas-node-data';
import { findFirstUpstreamModelNodeId } from '../workspace/graph-queries';

/**
 * Reads provider/model config from a connected Model node.
 *
 * Prefers domain bindings (incubator / hypothesis); falls back to graph edges.
 *
 * Uses primitive Zustand selectors to avoid useSyncExternalStore infinite loops.
 */
export function useConnectedModel(nodeId: string) {
  const { data: appConfig } = useAppConfig();
  const lockdown = appConfig?.lockdown === true;

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
      const data = getModelNodeData(s.nodes.find((n) => n.id === modelNodeId));
      return data?.providerId || DEFAULT_COMPILER_PROVIDER;
    },
  );

  const modelId = useCanvasStore(
    (s) => {
      if (!modelNodeId) return null;
      const data = getModelNodeData(s.nodes.find((n) => n.id === modelNodeId));
      return data?.modelId || null;
    },
  );

  const resolvedProviderId =
    lockdown && modelNodeId
      ? LOCKDOWN_PROVIDER_ID
      : providerId;
  const resolvedModelId =
    lockdown && modelNodeId ? LOCKDOWN_MODEL_ID : modelId;

  const { data: models } = useProviderModels(
    lockdown && modelNodeId ? LOCKDOWN_PROVIDER_ID : (providerId ?? ''),
  );

  const supportsVision = useMemo(
    () => models?.find((m) => m.id === resolvedModelId)?.supportsVision ?? false,
    [models, resolvedModelId],
  );

  const supportsReasoning = useMemo(
    () => models?.find((m) => m.id === resolvedModelId)?.supportsReasoning ?? false,
    [models, resolvedModelId],
  );

  return {
    providerId: resolvedProviderId,
    modelId: resolvedModelId,
    supportsVision,
    supportsReasoning,
    isConnected: modelNodeId !== null,
  };
}
