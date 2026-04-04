import { memo, useMemo } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { Loader2 } from 'lucide-react';
import { useSpecStore } from '../../../stores/spec-store';
import {
  NODE_TYPE_TO_SECTION,
  type CanvasNodeType,
} from '../../../stores/canvas-store';
import type { SectionNodeData } from '../../../types/canvas-data';
import { SPEC_SECTIONS } from '../../../lib/constants';
import { filledOrEmpty } from '../../../lib/node-status';
import { useCanvasNodePermanentRemove } from '../../../hooks/useCanvasNodePermanentRemove';
import { sectionCardDeleteCopy } from '../../../lib/canvas-permanent-delete-copy';
import ReferenceImageUpload from '../../shared/ReferenceImageUpload';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';

type SectionNodeType = Node<SectionNodeData, CanvasNodeType>;

function SectionNode({ id, type, selected }: NodeProps<SectionNodeType>) {
  const sectionId = NODE_TYPE_TO_SECTION[type as CanvasNodeType]!;
  const meta = SPEC_SECTIONS.find((s) => s.id === sectionId)!;
  const deleteCopy = useMemo(() => sectionCardDeleteCopy(meta.title), [meta.title]);
  const onRemove = useCanvasNodePermanentRemove(id, deleteCopy);
  const section = useSpecStore((s) => s.spec.sections[sectionId]);
  const updateSection = useSpecStore((s) => s.updateSection);
  const capturingImage = useSpecStore((s) => s.capturingImage);
  const content = section?.content ?? '';
  const isDesignBrief = type === 'designBrief';
  const isExistingDesign = type === 'existingDesign';
  const hasImages = isExistingDesign;
  const isCapturing = isExistingDesign && capturingImage === sectionId;

  const status = filledOrEmpty(!!content.trim());

  return (
    <NodeShell
      nodeId={id}
      nodeType={type as string}
      selected={!!selected}
      width="w-node"
      status={status}
      hasTarget={isExistingDesign}
      handleColor={content.trim() ? 'green' : 'amber'}
    >
      <NodeHeader onRemove={onRemove} description={meta.description}>
        <h3 className="text-xs font-semibold text-fg">{meta.title}</h3>
        {!meta.required && (
          <span className="text-nano text-fg-faint">optional</span>
        )}
      </NodeHeader>

      {/* Content — same textarea footprint across all section inputs */}
      <div className="px-3 pt-1 pb-2.5">
        <textarea
          value={content}
          onChange={(e) => updateSection(sectionId, e.target.value)}
          placeholder={
            isDesignBrief
              ? 'What do you want to design? e.g. "Redesign the checkout flow for mobile users"'
              : `Describe the ${meta.title.toLowerCase()}...`
          }
          rows={10}
          className="nodrag nowheel min-h-[var(--min-height-section-textarea)] w-full resize-y rounded border border-border px-2.5 py-2 text-xs leading-relaxed text-fg-secondary placeholder:text-fg-faint outline-none input-focus"
        />

        {/* Reference images for existing design */}
        {hasImages && (
          <div className="nodrag nowheel mt-2">
            <ReferenceImageUpload sectionId={sectionId} />
            {isCapturing && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed border-accent bg-info-subtle px-3 py-2.5">
                <Loader2 size={14} className="animate-spin text-info" />
                <span className="text-micro text-info">Capturing screenshot...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </NodeShell>
  );
}

export default memo(SectionNode);
