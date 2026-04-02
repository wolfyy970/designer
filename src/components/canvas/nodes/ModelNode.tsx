import { memo, useCallback, useEffect } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { DEFAULT_COMPILER_PROVIDER } from '../../../lib/constants';
import { filledOrEmpty } from '../../../lib/node-status';
import { useNodeProviderModel } from '../../../hooks/useNodeProviderModel';
import { useNodeRemoval } from '../../../hooks/useNodeRemoval';
import { useCanvasStore } from '../../../stores/canvas-store';
import type { ModelNodeData } from '../../../types/canvas-data';
import ProviderSelector from '../../shared/ProviderSelector';
import ModelSelector from '../../shared/ModelSelector';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';

type ModelNodeType = Node<ModelNodeData, 'model'>;

function ModelNode({ id, selected }: NodeProps<ModelNodeType>) {
  const onRemove = useNodeRemoval(id);

  const thinkingLevel = useCanvasStore(
    (s) =>
      ((s.nodes.find((n) => n.id === id)?.data as ModelNodeData)?.thinkingLevel as
        | 'off'
        | 'minimal'
        | 'low'
        | 'medium'
        | 'high'
        | undefined) ?? 'minimal',
  );

  const setThinkingLevel = useCallback(
    (level: 'off' | 'minimal' | 'medium') =>
      useCanvasStore.getState().updateNodeData(id, { thinkingLevel: level }),
    [id],
  );

  const {
    providerId,
    modelId,
    supportsReasoning,
    handleProviderChange,
    handleModelChange,
  } = useNodeProviderModel(DEFAULT_COMPILER_PROVIDER, id, { disconnectOnChange: false });

  useEffect(() => {
    if (!supportsReasoning && thinkingLevel !== 'off') {
      setThinkingLevel('off');
    }
  }, [supportsReasoning, thinkingLevel, setThinkingLevel]);

  const configured = !!modelId;

  const status = filledOrEmpty(configured);

  return (
    <NodeShell
      nodeId={id}
      nodeType="model"
      selected={!!selected}
      width="w-node"
      status={status}
      hasTarget={false}
      handleColor={configured ? 'green' : 'amber'}
    >
      <NodeHeader
        onRemove={onRemove}
        description={configured ? `${providerId} / ${modelId.split('/').pop()}` : 'No model selected'}
      >
        <h3 className="text-xs font-semibold text-fg">Model</h3>
      </NodeHeader>

      <div className="nodrag nowheel space-y-2 px-3 py-2.5">
        <ProviderSelector
          label="Provider"
          selectedId={providerId}
          onChange={handleProviderChange}
        />
        <ModelSelector
          label="Model"
          providerId={providerId}
          selectedModelId={modelId}
          onChange={handleModelChange}
        />
        {supportsReasoning && (
          <div className="nodrag nowheel space-y-1">
            <span className="text-nano text-fg-muted">Thinking</span>
            <div className="flex gap-0.5 rounded border border-border bg-surface p-0.5">
              {(['off', 'minimal', 'medium'] as const).map((level) => {
                const label = level === 'off' ? 'None' : level === 'minimal' ? 'Light' : 'Deep';
                return (
                  <button
                    key={level}
                    type="button"
                    onPointerDown={() => setThinkingLevel(level)}
                    className={`nodrag nowheel flex min-w-0 flex-1 items-center justify-center rounded px-1.5 py-0.5 text-nano transition-colors ${
                      thinkingLevel === level ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg-secondary'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </NodeShell>
  );
}

export default memo(ModelNode);
