import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { ClipboardCopy, Loader2, Wand2 } from 'lucide-react';
import { useSpecStore } from '../../../stores/spec-store';
import {
  NODE_TYPE_TO_SECTION,
  type CanvasNodeType,
} from '../../../stores/canvas-store';
import type { SectionNodeData } from '../../../types/canvas-data';
import { NODE_STATUS, RF_INTERACTIVE } from '../../../constants/canvas';
import { SPEC_SECTIONS } from '../../../lib/constants';
import { filledOrEmpty } from '../../../lib/node-status';
import { useCanvasNodePermanentRemove } from '../../../hooks/useCanvasNodePermanentRemove';
import { sectionCardDeleteCopy } from '../../../lib/canvas-permanent-delete-copy';
import { useElapsedTimer } from '../../../hooks/useElapsedTimer';
import { useFirstCanvasModel } from '../../../hooks/useFirstCanvasModel';
import { getActivePromptOverrides, usePromptOverridesStore } from '../../../stores/prompt-overrides-store';
import { generateSectionContent } from '../../../api/client';
import type { SectionGenerateTargetApiId } from '../../../api/types';
import { normalizeError } from '../../../lib/error-utils';
import ReferenceImageUpload from '../../shared/ReferenceImageUpload';
import GeneratingSkeleton from './GeneratingSkeleton';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';

const GENERATE_SECTION_API_ID: Partial<
  Record<CanvasNodeType, SectionGenerateTargetApiId>
> = {
  researchContext: 'research-context',
  objectivesMetrics: 'objectives-metrics',
  designConstraints: 'design-constraints',
};

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

  const generateApiId = GENERATE_SECTION_API_ID[type as CanvasNodeType];
  const showMagicWand = generateApiId != null;
  const designBriefContent =
    useSpecStore((s) => s.spec.sections['design-brief']?.content ?? '');
  const { providerId, modelId, hasModel } = useFirstCanvasModel();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const elapsed = useElapsedTimer(generating);

  const handleGenerateFromBrief = useCallback(async () => {
    const apiId = GENERATE_SECTION_API_ID[type as CanvasNodeType];
    if (!apiId || !hasModel || !providerId || !modelId) return;
    const spec = useSpecStore.getState().spec.sections;
    const brief = spec['design-brief']?.content ?? '';
    if (!brief.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const promptOverrides = getActivePromptOverrides(
        usePromptOverridesStore.getState().overrides,
      );
      const response = await generateSectionContent({
        sectionId: apiId,
        designBrief: brief,
        existingDesign: spec['existing-design']?.content,
        researchContext: spec['research-context']?.content,
        objectivesMetrics: spec['objectives-metrics']?.content,
        designConstraints: spec['design-constraints']?.content,
        providerId,
        modelId,
        ...(promptOverrides ? { promptOverrides } : {}),
      });
      const sid = NODE_TYPE_TO_SECTION[type as CanvasNodeType]!;
      useSpecStore.getState().updateSection(sid, response.result);
    } catch (err) {
      setGenerateError(normalizeError(err, 'Generation failed'));
    } finally {
      setGenerating(false);
    }
  }, [type, hasModel, providerId, modelId]);

  const status = generating
    ? NODE_STATUS.PROCESSING
    : filledOrEmpty(!!content.trim());

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
        {generating ? (
          <GeneratingSkeleton variant="contentOnly" elapsed={elapsed} />
        ) : (
          <textarea
            value={content}
            onChange={(e) => updateSection(sectionId, e.target.value)}
            placeholder={
              isDesignBrief
                ? 'What do you want to design? e.g. "Redesign the checkout flow for mobile users"'
                : `Describe the ${meta.title.toLowerCase()}...`
            }
            rows={10}
            className={`${RF_INTERACTIVE} min-h-[var(--min-height-section-textarea)] w-full resize-y rounded border border-border px-2.5 py-2 text-xs leading-relaxed text-fg-secondary placeholder:text-fg-faint outline-none input-focus`}
          />
        )}

        {showMagicWand && (
          <div className={`${RF_INTERACTIVE} mt-2 flex flex-col gap-2`}>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!generating && !hasModel && (
                <span className="text-nano text-fg-muted">Add a Model node on the canvas</span>
              )}
              {!generating && hasModel && !designBriefContent.trim() && (
                <span className="text-nano text-fg-muted">Fill Design Brief first</span>
              )}
              <button
                type="button"
                title={generating ? 'Generating…' : 'Generate from design brief'}
                aria-label={
                  generating ? 'Generating from design brief' : 'Generate from design brief'
                }
                aria-busy={generating}
                disabled={generating || !hasModel || !designBriefContent.trim()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => void handleGenerateFromBrief()}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-micro font-medium text-fg-secondary transition-colors hover:border-accent hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                {generating ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-accent" aria-hidden />
                    Generating…
                  </>
                ) : (
                  <>
                    <Wand2 size={14} className="text-accent" aria-hidden />
                    Generate
                  </>
                )}
              </button>
            </div>
            {generateError && (
              <div className="mb-2 rounded bg-error-subtle px-2 py-1.5 text-nano text-error select-text">
                <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words font-sans leading-snug text-inherit [font-size:inherit]">
                  {generateError}
                </pre>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => void navigator.clipboard?.writeText(generateError)}
                  className={`${RF_INTERACTIVE} mt-1 flex items-center gap-1 rounded px-0.5 py-0.5 text-nano font-medium text-error hover:bg-error-surface hover:text-error`}
                >
                  <ClipboardCopy size={10} className="shrink-0 opacity-90" aria-hidden />
                  Copy message
                </button>
              </div>
            )}
          </div>
        )}

        {/* Reference images for existing design */}
        {hasImages && (
          <div className={`${RF_INTERACTIVE} mt-2`}>
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
