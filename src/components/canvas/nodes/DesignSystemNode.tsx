import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { useDropzone } from 'react-dropzone';
import { FileText, ImagePlus, X } from 'lucide-react';
import { useCanvasStore } from '../../../stores/canvas-store';
import type { DesignSystemNodeData } from '../../../types/canvas-data';
import { RF_INTERACTIVE } from '../../../constants/canvas';
import {
  isDesignSystemMarkdownFile,
  readFileAsDesignSystemMarkdownSource,
  readFileAsReferenceImage,
} from '../../../lib/image-utils';
import { filledOrEmpty } from '../../../lib/node-status';
import {
  getDesignSystemEffectiveState,
  getDesignSystemSourceMode,
} from '../../../lib/design-md';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';
import type { DesignSystemMarkdownSource } from '../../../types/design-system-source';
import type { ReferenceImage } from '../../../types/spec';
import {
  DESIGN_SYSTEM_SOURCE_MODES,
  type DesignSystemSourceMode,
} from '../../../types/design-system-mode';

type DesignSystemNodeType = Node<DesignSystemNodeData, 'designSystem'>;

function DesignSystemNode({ id, data, selected }: NodeProps<DesignSystemNodeType>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const title = data.title || 'Design System';
  const content = data.content || '';
  const images = useMemo(() => data.images ?? [], [data.images]);
  const markdownSources = useMemo(() => data.markdownSources ?? [], [data.markdownSources]);
  const sourceMode = getDesignSystemSourceMode(data);
  const isCustomMode = sourceMode === 'custom';
  const designSystemState = useMemo(() => getDesignSystemEffectiveState(data), [data]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const update = useCallback(
    (field: string, value: unknown) => updateNodeData(id, { [field]: value }),
    [id, updateNodeData],
  );

  const getCurrentImages = useCallback(
    () => (useCanvasStore.getState().nodes.find((n) => n.id === id)?.data.images as ReferenceImage[]) || [],
    [id],
  );

  const getCurrentMarkdownSources = useCallback(
    () =>
      (useCanvasStore.getState().nodes.find((n) => n.id === id)?.data.markdownSources as
        | DesignSystemMarkdownSource[]
        | undefined) || [],
    [id],
  );

  const switchToCustom = useCallback(
    () => updateNodeData(id, { sourceMode: 'custom' }),
    [id, updateNodeData],
  );

  const updateCustomContent = useCallback(
    (value: string) => {
      updateNodeData(id, { content: value, sourceMode: 'custom' });
    },
    [id, updateNodeData],
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploadError(null);
      const imageFiles = acceptedFiles.filter((file) => !isDesignSystemMarkdownFile(file));
      const markdownFiles = acceptedFiles.filter(isDesignSystemMarkdownFile);
      const [imageResults, markdownResults] = await Promise.all([
        Promise.allSettled(imageFiles.map((file) => readFileAsReferenceImage(file))),
        Promise.allSettled(markdownFiles.map((file) => readFileAsDesignSystemMarkdownSource(file))),
      ]);
      const newImages = imageResults
        .filter((result): result is PromiseFulfilledResult<ReferenceImage> => result.status === 'fulfilled')
        .map((result) => result.value);
      const newMarkdownSources = markdownResults
        .filter((result): result is PromiseFulfilledResult<DesignSystemMarkdownSource> => result.status === 'fulfilled')
        .map((result) => result.value);
      const firstError = [...imageResults, ...markdownResults].find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (firstError) {
        setUploadError(firstError.reason instanceof Error ? firstError.reason.message : 'Some files could not be read.');
      }
      if (newImages.length === 0 && newMarkdownSources.length === 0) return;
      updateNodeData(id, {
        sourceMode: 'custom',
        images: [...getCurrentImages(), ...newImages],
        markdownSources: [...getCurrentMarkdownSources(), ...newMarkdownSources],
      });
    },
    [id, updateNodeData, getCurrentImages, getCurrentMarkdownSources],
  );

  const removeImage = useCallback(
    (imageId: string) => {
      updateNodeData(id, {
        images: getCurrentImages().filter((img) => img.id !== imageId),
        sourceMode: 'custom',
      });
    },
    [id, updateNodeData, getCurrentImages],
  );

  const updateImageDescription = useCallback(
    (imageId: string, description: string) => {
      updateNodeData(id, {
        sourceMode: 'custom',
        images: getCurrentImages().map((img) =>
          img.id === imageId ? { ...img, description } : img,
        ),
      });
    },
    [id, updateNodeData, getCurrentImages],
  );

  const removeMarkdownSource = useCallback(
    (sourceId: string) => {
      updateNodeData(id, {
        sourceMode: 'custom',
        markdownSources: getCurrentMarkdownSources().filter((source) => source.id !== sourceId),
      });
    },
    [id, updateNodeData, getCurrentMarkdownSources],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected: () => setUploadError('Use image files or a DESIGN.md file.'),
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'text/markdown': ['.md', '.markdown'],
      'text/plain': ['.md', '.markdown'],
    },
  });

  const setSourceMode = useCallback(
    (mode: DesignSystemSourceMode) => updateNodeData(id, { sourceMode: mode }),
    [id, updateNodeData],
  );

  const status = filledOrEmpty(designSystemState.hasEffectiveSourceInput);
  const sourceModeLabels: Record<DesignSystemSourceMode, string> = {
    wireframe: 'Wireframe',
    custom: 'Custom',
    none: 'None',
  };

  return (
    <NodeShell
      nodeId={id}
      nodeType="designSystem"
      selected={!!selected}
      width="w-node"
      status={status}
      handleColor={designSystemState.hasEffectiveSourceInput ? 'green' : 'amber'}
      leftRail={designSystemState.hasEffectiveSourceInput ? 'success' : 'warning'}
    >
      <NodeHeader
        description="Design tokens, components, and patterns"
      >
        <input
          value={title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="Design System"
          className={`${RF_INTERACTIVE} min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs font-semibold text-fg placeholder:text-fg-faint outline-none hover:border-border focus:border-accent`}
        />
      </NodeHeader>

      <div className="px-3 py-2.5">
        <div className={`${RF_INTERACTIVE} mb-2 flex items-center justify-between gap-2`}>
          <span className="text-nano font-medium text-fg-muted">Style</span>
          <select
            value={sourceMode}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setSourceMode(e.target.value as DesignSystemSourceMode)}
            className="nodrag nowheel rounded border border-border bg-bg px-2 py-1 text-nano font-semibold text-fg-secondary outline-none input-focus"
            aria-label="Design system style"
          >
            {DESIGN_SYSTEM_SOURCE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {sourceModeLabels[mode]}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-2 text-nano leading-snug text-fg-muted">
          {sourceMode === 'wireframe'
            ? designSystemState.hasCustomSourceInput
              ? 'Using Wireframe. Custom sources are saved.'
              : 'Using built-in Wireframe DESIGN.md.'
            : sourceMode === 'none'
              ? designSystemState.hasCustomSourceInput
                ? 'Design-system guidance is excluded. Custom sources are saved.'
                : 'Design-system guidance is excluded.'
              : designSystemState.hasCustomSourceInput
                ? 'Using custom notes, images, and DESIGN.md.'
                : 'Add custom notes, images, or DESIGN.md.'}
        </div>

        {isCustomMode ? (
          <>
            <textarea
              value={content}
              onFocus={switchToCustom}
              onChange={(e) => updateCustomContent(e.target.value)}
              placeholder="Paste tokens, component guidance, patterns, brand notes, or visual-system references..."
              rows={4}
              className={`${RF_INTERACTIVE} w-full resize-none rounded border border-border px-2.5 py-2 text-xs text-fg-secondary placeholder:text-fg-faint outline-none input-focus`}
            />

            <div className={`${RF_INTERACTIVE} mt-2`}>
              {(images.length > 0 || markdownSources.length > 0) && (
                <div className="mb-2 grid gap-2">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="group relative flex gap-2 rounded-lg border border-border bg-surface p-2"
                    >
                      <img
                        src={img.dataUrl}
                        alt={img.filename}
                        className="h-16 w-16 shrink-0 rounded border border-border object-cover"
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-nano font-medium text-fg-secondary">
                          {img.filename}
                        </span>
                        <textarea
                          value={img.description}
                          onChange={(e) => updateImageDescription(img.id, e.target.value)}
                          placeholder="Describe what this image shows..."
                          rows={2}
                          className="w-full resize-none rounded border border-border bg-bg px-2 py-1 text-nano text-fg-secondary placeholder-fg-muted input-focus"
                        />
                      </div>
                      <button
                        onClick={() => removeImage(img.id)}
                        className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-fg p-0.5 text-bg hover:bg-error group-hover:block"
                        aria-label="Remove image"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  {markdownSources.map((source) => (
                    <div
                      key={source.id}
                      className="group relative flex items-center gap-2 rounded-lg border border-border bg-surface p-2"
                    >
                      <FileText size={14} className="shrink-0 text-accent" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-nano font-medium text-fg-secondary">
                          {source.filename}
                        </div>
                        <div className="text-[10px] text-fg-muted">
                          {Math.max(1, Math.round(source.sizeBytes / 1024))} KB DESIGN.md source
                        </div>
                      </div>
                      <button
                        onClick={() => removeMarkdownSource(source.id)}
                        className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-fg p-0.5 text-bg hover:bg-error group-hover:block"
                        aria-label={`Remove ${source.filename}`}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div
                {...getRootProps()}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-3 text-center transition-colors ${
                  isDragActive
                    ? 'border-accent bg-surface'
                    : 'border-border hover:border-border hover:bg-surface'
                }`}
              >
                <input {...getInputProps()} />
                <ImagePlus size={16} className="mx-auto mb-0.5 text-fg-muted" />
                <p className="text-nano text-fg-secondary">
                  {isDragActive ? 'Drop files here' : 'Drop images or DESIGN.md'}
                </p>
              </div>
              {uploadError ? (
                <p className="mt-1.5 text-nano text-error">{uploadError}</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </NodeShell>
  );
}

export default memo(DesignSystemNode);
