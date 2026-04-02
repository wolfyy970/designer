import { useCallback, useMemo } from 'react';
import { useCanvasStore } from '../stores/canvas-store';
import { useProviderModels } from './useProviderModels';

interface UseNodeProviderModelOptions {
  /** When true, disconnects downstream edges on provider/model change (default: true) */
  disconnectOnChange?: boolean;
}

/**
 * Shared provider/model selection state for canvas processing nodes
 * (CompilerNode and HypothesisNode). Values are persisted in canvas node data
 * so they survive page reload.
 *
 * Uses primitive Zustand selectors to avoid useSyncExternalStore infinite loops.
 */
export function useNodeProviderModel(
  defaultProvider: string,
  nodeId: string,
  options: UseNodeProviderModelOptions = {},
) {
  const { disconnectOnChange = true } = options;

  // Primitive selectors — stable across re-renders when value unchanged
  const storedProviderId = useCanvasStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data.providerId as string | undefined,
  );
  const storedModelId = useCanvasStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data.modelId as string | undefined,
  );

  const providerId = storedProviderId || defaultProvider;
  const modelId = storedModelId || '';
  const { data: models } = useProviderModels(providerId);

  const handleProviderChange = useCallback(
    (newId: string) => {
      const store = useCanvasStore.getState();
      store.updateNodeData(nodeId, { providerId: newId, modelId: '' });
      if (disconnectOnChange) {
        store.disconnectOutputs(nodeId);
      }
    },
    [nodeId, disconnectOnChange],
  );

  const handleModelChange = useCallback(
    (model: string) => {
      const store = useCanvasStore.getState();
      if (disconnectOnChange && modelId && model !== modelId) {
        store.disconnectOutputs(nodeId);
      }
      store.updateNodeData(nodeId, { modelId: model });
    },
    [nodeId, modelId, disconnectOnChange],
  );

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
    models,
    supportsVision,
    supportsReasoning,
    handleProviderChange,
    handleModelChange,
  };
}
