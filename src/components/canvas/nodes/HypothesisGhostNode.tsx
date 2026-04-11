import { memo, useCallback } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import { Plus, Wand2 } from 'lucide-react';
import { NODE_TYPES, RF_INTERACTIVE } from '../../../constants/canvas';
import { useCanvasStore } from '../../../stores/canvas-store';
import { useSpecStore } from '../../../stores/spec-store';
import { useFirstCanvasModel } from '../../../hooks/useFirstCanvasModel';
import { markPendingAutoGenerate } from '../../../lib/hypothesis-pending-generate';
import type { HypothesisGhostData } from '../../../types/canvas-data';

type HypothesisGhostFlowNode = Node<HypothesisGhostData, 'hypothesisGhost'>;

function HypothesisGhostNode({ id }: NodeProps<HypothesisGhostFlowNode>) {
  const { hasModel } = useFirstCanvasModel();
  const hasDesignBrief = useSpecStore(
    (s) => Boolean(s.spec.sections['design-brief']?.content?.trim()),
  );

  const canGenerate = hasModel && hasDesignBrief;

  const generateDisabledReason = !hasModel
    ? 'Connect a Model node first'
    : !hasDesignBrief
      ? 'Fill in the Design Brief first'
      : undefined;

  const onAddBlank = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    useCanvasStore.getState().addNode(NODE_TYPES.HYPOTHESIS);
  }, []);

  const onGenerate = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const newNodeId = useCanvasStore.getState().addNode(NODE_TYPES.HYPOTHESIS);
    if (newNodeId) markPendingAutoGenerate(newNodeId);
  }, []);

  return (
    <div
      data-node-id={id}
      className={`${RF_INTERACTIVE} flex w-node flex-col rounded-lg border border-dashed border-border-dashed-ghost bg-surface-ghost-backdrop shadow-sm ring-1 ring-inset ring-border-inset-ring`}
    >
      <div className="border-b border-border-section-divider px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg-muted">New hypothesis</h3>
          <span className="text-nano shrink-0 uppercase tracking-wide text-fg-faint">add</span>
        </div>
      </div>

      <div className={`${RF_INTERACTIVE} flex gap-2 px-3 py-3`}>
        {/* Blank */}
        <button
          type="button"
          onPointerDown={onAddBlank}
          className={`${RF_INTERACTIVE} flex flex-1 flex-col items-center gap-1.5 rounded-md border border-border bg-surface-raised px-3 py-3 text-fg-secondary shadow-sm transition-colors hover:border-accent-border-medium hover:bg-surface hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
          aria-label="Add a blank hypothesis card"
        >
          <Plus size={18} strokeWidth={2} aria-hidden />
          <span className="text-nano font-medium">Blank</span>
        </button>

        {/* Generate */}
        <button
          type="button"
          onPointerDown={canGenerate ? onGenerate : undefined}
          disabled={!canGenerate}
          title={generateDisabledReason}
          className={`${RF_INTERACTIVE} flex flex-1 flex-col items-center gap-1.5 rounded-md border px-3 py-3 shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            canGenerate
              ? 'border-border bg-surface-raised text-fg-secondary hover:border-accent-border-medium hover:bg-surface hover:text-accent'
              : 'cursor-not-allowed border-border bg-surface-raised opacity-40'
          }`}
          aria-label={generateDisabledReason ?? 'Add and generate a hypothesis from your brief'}
        >
          <Wand2 size={18} strokeWidth={2} className={canGenerate ? 'text-accent' : undefined} aria-hidden />
          <span className="text-nano font-medium">Generate</span>
        </button>
      </div>
    </div>
  );
}

export default memo(HypothesisGhostNode);
