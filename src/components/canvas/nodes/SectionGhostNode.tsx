import { memo, useCallback } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import { Plus, X } from 'lucide-react';
import { useCanvasStore } from '../../../stores/canvas-store';
import { SPEC_SECTIONS } from '../../../lib/constants';
import { NODE_TYPE_TO_SECTION } from '../../../types/workspace-graph';
import type { SectionGhostData } from '../../../types/canvas-data';

type SectionGhostFlowNode = Node<SectionGhostData, 'sectionGhost'>;

function SectionGhostNode({ data }: NodeProps<SectionGhostFlowNode>) {
  const { targetType } = data;
  const sectionId = NODE_TYPE_TO_SECTION[targetType]!;
  const meta = SPEC_SECTIONS.find((s) => s.id === sectionId)!;

  const onAdd = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      useCanvasStore.getState().addNode(targetType);
    },
    [targetType],
  );

  const onDismiss = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      useCanvasStore.getState().dismissSectionGhostSlot(targetType);
    },
    [targetType],
  );

  return (
    <div className="nodrag nowheel flex w-node flex-col rounded-lg border border-dashed border-border-dashed-ghost bg-surface-ghost-backdrop shadow-sm ring-1 ring-inset ring-border-inset-ring">
      <div className="relative border-b border-border-section-divider px-3 py-2">
        <div className="flex items-baseline justify-between gap-2 pr-6">
          <h3 className="text-xs font-semibold text-fg-muted">{meta.title}</h3>
          <span className="text-nano shrink-0 uppercase tracking-wide text-fg-faint">
            optional
          </span>
        </div>
        <button
          type="button"
          onPointerDown={onDismiss}
          className="nodrag nowheel absolute right-2 top-2 rounded p-0.5 text-fg-faint transition-colors hover:bg-surface hover:text-fg"
          aria-label={`Hide suggested card: ${meta.title}`}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center px-3 pt-2 pb-3">
        <p className="text-micro mb-3 max-h-[var(--max-height-section-ghost-preview)] overflow-hidden text-pretty leading-relaxed text-fg-secondary">
          {meta.description}
        </p>
        <button
          type="button"
          onPointerDown={onAdd}
          className="nodrag nowheel flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-fg-secondary shadow-sm transition-colors hover:border-accent-border-medium hover:bg-surface hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`Add ${meta.title} to the canvas`}
        >
          <Plus size={22} strokeWidth={2.25} aria-hidden />
        </button>
        <span className="text-nano mt-2 text-center text-fg-faint">Add to workspace</span>
      </div>
    </div>
  );
}

export default memo(SectionGhostNode);
