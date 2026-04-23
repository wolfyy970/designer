import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@ds/components/ui/badge';
import { type NodeProps, type Node } from '@xyflow/react';
import { Loader2, Wand2, X } from 'lucide-react';
import { useSpecStore } from '../../../stores/spec-store';
import {
  NODE_TYPE_TO_SECTION,
  type CanvasNodeType,
} from '../../../stores/canvas-store';
import type { InputNodeData } from '../../../types/canvas-data';
import { NODE_STATUS, RF_INTERACTIVE } from '../../../constants/canvas';
import { SPEC_SECTIONS } from '../../../lib/constants';
import { filledOrEmpty } from '../../../lib/node-status';
import { useCanvasNodePermanentRemove } from '../../../hooks/useCanvasNodePermanentRemove';
import { inputCardDeleteCopy } from '../../../lib/canvas-permanent-delete-copy';
import { useElapsedTimer } from '../../../hooks/useElapsedTimer';
import { useFirstCanvasModel } from '../../../hooks/useFirstCanvasModel';
import { generateInputContent } from '../../../api/client';
import { createTaskStreamSession } from '../../../hooks/task-stream-session';
import { createInitialTaskStreamState, type TaskStreamState } from '../../../hooks/task-stream-state';
import type { InputsGenerateTargetApiId } from '../../../api/types';
import ReferenceImageUpload from '../../shared/ReferenceImageUpload';
import TaskStreamMonitor from './TaskStreamMonitor';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';
import { NodeErrorBlock } from './shared/NodeErrorBlock';

const GENERATE_INPUT_API_ID: Partial<
  Record<CanvasNodeType, InputsGenerateTargetApiId>
> = {
  researchContext: 'research-context',
  objectivesMetrics: 'objectives-metrics',
  designConstraints: 'design-constraints',
};

type InputNodeFlowType = Node<InputNodeData, CanvasNodeType>;

function InputNode({ id, type, selected }: NodeProps<InputNodeFlowType>) {
  const sectionId = NODE_TYPE_TO_SECTION[type as CanvasNodeType]!;
  const meta = SPEC_SECTIONS.find((s) => s.id === sectionId)!;
  const deleteCopy = useMemo(() => inputCardDeleteCopy(meta.title), [meta.title]);
  const onRemove = useCanvasNodePermanentRemove(id, deleteCopy);
  const section = useSpecStore((s) => s.spec.sections[sectionId]);
  const updateSection = useSpecStore((s) => s.updateSection);
  const capturingImage = useSpecStore((s) => s.capturingImage);
  const content = section?.content ?? '';
  const isDesignBrief = type === 'designBrief';
  const isExistingDesign = type === 'existingDesign';
  const hasImages = isExistingDesign;
  const isCapturing = isExistingDesign && capturingImage === sectionId;

  const generateApiId = GENERATE_INPUT_API_ID[type as CanvasNodeType];
  const designBriefContent =
    useSpecStore((s) => s.spec.sections['design-brief']?.content ?? '');
  const { providerId, modelId, hasModel } = useFirstCanvasModel();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [taskStreamState, setTaskStreamState] = useState<TaskStreamState>(() =>
    createInitialTaskStreamState('idle'),
  );
  const elapsed = useElapsedTimer(generating);
  const abortGenRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      abortGenRef.current?.abort();
    };
  }, []);

  /** Research / objectives / constraints only: hide wand once this facet has text; keep during an in-flight generate. */
  const showGenerateSection =
    generateApiId != null && (generating || !content.trim());

  const handleGenerateFromBrief = useCallback(async () => {
    const apiId = GENERATE_INPUT_API_ID[type as CanvasNodeType];
    if (!apiId || !hasModel || !providerId || !modelId) return;
    const spec = useSpecStore.getState().spec.sections;
    const brief = spec['design-brief']?.content ?? '';
    if (!brief.trim()) return;
    const ac = new AbortController();
    abortGenRef.current?.abort();
    abortGenRef.current = ac;

    setGenerating(true);
    setGenerateError(null);
    setTaskStreamState({ ...createInitialTaskStreamState(), status: 'streaming' });
    let session: ReturnType<typeof createTaskStreamSession> | undefined;
    try {
      const taskSession = createTaskStreamSession({
        sessionId: `input-gen-${id}-${apiId}-${Date.now()}`,
        correlationId: crypto.randomUUID(),
        onPatch: (patch) => setTaskStreamState((prev) => ({ ...prev, ...patch })),
      });
      session = taskSession;
      const response = await generateInputContent(
        {
          inputId: apiId,
          designBrief: brief,
          existingDesign: spec['existing-design']?.content,
          researchContext: spec['research-context']?.content,
          objectivesMetrics: spec['objectives-metrics']?.content,
          designConstraints: spec['design-constraints']?.content,
          providerId,
          modelId,
        },
        { agentic: taskSession.callbacks, signal: ac.signal },
      );
      if (response && !ac.signal.aborted) {
        const sid = NODE_TYPE_TO_SECTION[type as CanvasNodeType]!;
        useSpecStore.getState().updateSection(sid, response.result);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setGenerateError(err instanceof Error ? err.message : 'Generation failed');
   } finally {
      void session?.finalize();
      setTaskStreamState(createInitialTaskStreamState('idle'));
      setGenerating(false);
    }
  }, [type, hasModel, providerId, modelId, id]);

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
      leftRail={content.trim() ? 'success' : (meta.required ? 'warning' : null)}
    >
      <NodeHeader onRemove={onRemove} description={meta.description}>
        <h3 className="text-xs font-semibold text-fg">{meta.title}</h3>
        {!content.trim() && meta.required ? (
          <Badge shape="pill" tone="warning">needs input</Badge>
        ) : null}
      </NodeHeader>

      {/* Content — same textarea footprint across all spec input nodes */}
      <div className="px-3 pt-1 pb-2.5">
        {generating ? (
          <TaskStreamMonitor
            state={taskStreamState}
            elapsed={elapsed}
            fallbackLabel="Agent working…"
          />
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
            className={`${RF_INTERACTIVE} min-h-[var(--min-height-input-textarea)] w-full resize-y rounded border border-border px-2.5 py-2 text-xs leading-relaxed text-fg-secondary placeholder:text-fg-faint outline-none input-focus`}
          />
        )}

        {showGenerateSection && (
          <div className={`${RF_INTERACTIVE} mt-2 flex flex-col gap-2`}>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!generating && !hasModel && (
                <span className="text-nano text-fg-muted">Add a Model node on the canvas</span>
              )}
              {!generating && hasModel && !designBriefContent.trim() && (
                <Badge shape="pill" tone="warning">fill design brief first</Badge>
              )}
              {generating ? (
                <button
                  type="button"
                  title="Cancel generation"
                  aria-label="Cancel generation"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => abortGenRef.current?.abort()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-micro font-medium text-fg-secondary transition-colors hover:border-error-border-medium hover:text-error"
                >
                  <X size={14} aria-hidden />
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  title="Generate from design brief"
                  aria-label="Generate from design brief"
                  disabled={!hasModel || !designBriefContent.trim()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => void handleGenerateFromBrief()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-micro font-medium text-fg-secondary transition-colors hover:border-accent hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Wand2 size={14} className="text-accent" aria-hidden />
                  Generate
                </button>
              )}
            </div>
            {generateError && <NodeErrorBlock message={generateError} />}
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

export default memo(InputNode);
