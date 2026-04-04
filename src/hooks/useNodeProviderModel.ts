import { useCallback, useMemo } from 'react';
import { useCanvasStore } from '../stores/canvas-store';
import { LOCKDOWN_MODEL_ID, LOCKDOWN_PROVIDER_ID } from '../lib/lockdown-model';
import { useAppConfig } from './useAppConfig';
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
  const { data: appConfig } = useAppConfig();
  const lockdown = appConfig?.lockdown === true;

  // Primitive selectors — stable across re-renders when value unchanged
  const storedProviderId = useCanvasStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data.providerId as string | undefined,
  );
  const storedModelId = useCanvasStore(
    (s) => s.nodes.find((n) => n.id === nodeId)?.data.modelId as string | undefined,
  );

  const providerId = lockdown
    ? LOCKDOWN_PROVIDER_ID
    : (storedProviderId || defaultProvider);
  const modelId = lockdown ? LOCKDOWN_MODEL_ID : (storedModelId || '');
  const { data: models } = useProviderModels(lockdown ? LOCKDOWN_PROVIDER_ID : providerId);
  const storedModelIdForWrites = storedModelId || '';

  const handleProviderChange = useCallback(
    (newId: string) => {
      if (lockdown) return;
      const store = useCanvasStore.getState();
      store.updateNodeData(nodeId, { providerId: newId, modelId: '' });
      if (disconnectOnChange) {
        store.disconnectOutputs(nodeId);
      }
    },
    [nodeId, disconnectOnChange, lockdown],
  );

  const handleModelChange = useCallback(
    (model: string) => {
      if (lockdown) return;
      const store = useCanvasStore.getState();
      if (disconnectOnChange && storedModelIdForWrites && model !== storedModelIdForWrites) {
        store.disconnectOutputs(nodeId);
      }
      store.updateNodeData(nodeId, { modelId: model });
    },
    [nodeId, storedModelIdForWrites, disconnectOnChange, lockdown],
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
