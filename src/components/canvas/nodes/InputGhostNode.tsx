import { memo, useCallback } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { RF_INTERACTIVE } from '../../../constants/canvas';
import { useCanvasStore } from '../../../stores/canvas-store';
import { SPEC_SECTIONS } from '../../../lib/constants';
import { NODE_TYPE_TO_SECTION } from '../../../types/workspace-graph';
import { INPUT_GHOST_NODE_TYPE } from '../../../constants/canvas';
import type { InputGhostData } from '../../../types/canvas-data';

type InputGhostFlowNode = Node<InputGhostData, typeof INPUT_GHOST_NODE_TYPE>;

function InputGhostNode({ data }: NodeProps<InputGhostFlowNode>) {
  const { targetType } = data;
  const sectionId = NODE_TYPE_TO_SECTION[targetType]!;
  const meta = SPEC_SECTIONS.find((s) => s.id === sectionId)!;

  const onAdd = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const store = useCanvasStore.getState();
      const nodeId = store.addNode(targetType);
      if (nodeId) store.requestNodeFocus(nodeId);
    },
    [targetType],
  );

  return (
    <div className={`${RF_INTERACTIVE} flex w-node flex-col rounded-lg border border-dashed border-border-dashed-ghost bg-surface-ghost-backdrop shadow-sm ring-1 ring-inset ring-border-inset-ring`}>
      <div className="relative border-b border-border-section-divider px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg-secondary">{meta.title}</h3>
          <span className="text-nano shrink-0 uppercase tracking-wide text-fg-muted">
            optional
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center px-3 pt-2 pb-3">
        <p className="text-micro mb-3 max-h-[var(--max-height-section-ghost-preview)] self-stretch overflow-hidden text-left text-pretty leading-relaxed text-fg-secondary">
          {meta.description}
        </p>
        <button
          type="button"
          onPointerDown={onAdd}
          className={`${RF_INTERACTIVE} flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-fg-secondary shadow-sm transition-colors hover:border-accent-border-medium hover:bg-surface hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
          aria-label={`Add ${meta.title} to the canvas`}
        >
          <Plus size={22} strokeWidth={2.25} aria-hidden />
        </button>
        <span className="text-nano mt-2 text-center text-fg-muted">Add to canvas</span>
      </div>
    </div>
  );
}

export default memo(InputGhostNode);
