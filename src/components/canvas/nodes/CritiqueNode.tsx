import { memo, useCallback } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { useCanvasStore } from '../../../stores/canvas-store';
import type { CritiqueNodeData } from '../../../types/canvas-data';
import { useCanvasNodePermanentRemove } from '../../../hooks/useCanvasNodePermanentRemove';
import { STATIC_NODE_DELETE_COPY } from '../../../lib/canvas-permanent-delete-copy';
import { filledOrEmpty } from '../../../lib/node-status';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';
import CompactField from './CompactField';

type CritiqueNodeType = Node<CritiqueNodeData, 'critique'>;

function CritiqueNode({ id, data, selected }: NodeProps<CritiqueNodeType>) {
  const onRemove = useCanvasNodePermanentRemove(id, STATIC_NODE_DELETE_COPY.critique);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const title = data.title || '';
  const strengths = data.strengths || '';
  const improvements = data.improvements || '';
  const direction = data.direction || '';

  const update = useCallback(
    (field: string, value: string) => updateNodeData(id, { [field]: value }),
    [id, updateNodeData]
  );

  const hasFeedback = !!(strengths.trim() || improvements.trim() || direction.trim());
  const status = filledOrEmpty(hasFeedback);

  return (
    <NodeShell
      nodeId={id}
      nodeType="critique"
      selected={!!selected}
      width="w-node"
      status={status}
      handleColor={strengths.trim() || improvements.trim() || direction.trim() ? 'green' : 'amber'}
    >
      <NodeHeader
        onRemove={onRemove}
        className="border-b border-warning/20 bg-warning-subtle"
        description={<span className="text-warning">Feedback for next iteration</span>}
      >
        <input
          value={title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="Critique"
          className="nodrag nowheel min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs font-semibold text-fg placeholder:text-warning/50 outline-none hover:border-warning/30 focus:border-warning"
        />
      </NodeHeader>

      {/* Fields */}
      <div className="space-y-2.5 px-3 py-2.5">
        <CompactField
          label="What works well"
          value={strengths}
          onChange={(v) => update('strengths', v)}
          placeholder="Preserve these aspects..."
          labelClassName="text-warning"
        />
        <CompactField
          label="What needs improvement"
          value={improvements}
          onChange={(v) => update('improvements', v)}
          placeholder="Change or fix these..."
          labelClassName="text-warning"
        />
        <CompactField
          label="Direction"
          value={direction}
          onChange={(v) => update('direction', v)}
          placeholder="Try this next..."
          labelClassName="text-warning"
        />
      </div>
    </NodeShell>
  );
}

export default memo(CritiqueNode);
