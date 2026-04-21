import { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { useDropzone } from 'react-dropzone';
import { ImagePlus, Sparkles, Loader2, X } from 'lucide-react';
import { useCanvasStore } from '../../../stores/canvas-store';
import type { DesignSystemNodeData } from '../../../types/canvas-data';
import { extractDesignSystem } from '../../../api/client';
import { RF_INTERACTIVE } from '../../../constants/canvas';
import { readFileAsReferenceImage } from '../../../lib/image-utils';
import { useConnectedModel } from '../../../hooks/useConnectedModel';
import { Button } from '@ds/components/ui/button';
import { useCanvasNodePermanentRemove } from '../../../hooks/useCanvasNodePermanentRemove';
import { STATIC_NODE_DELETE_COPY } from '../../../lib/canvas-permanent-delete-copy';
import { filledOrEmpty } from '../../../lib/node-status';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';
import { NodeErrorBlock } from './shared/NodeErrorBlock';
import type { ReferenceImage } from '../../../types/spec';

type DesignSystemNodeType = Node<DesignSystemNodeData, 'designSystem'>;

function DesignSystemNode({ id, data, selected }: NodeProps<DesignSystemNodeType>) {
  const onRemove = useCanvasNodePermanentRemove(id, STATIC_NODE_DELETE_COPY.designSystem);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const title = data.title || 'Design System';
  const content = data.content || '';
  const images = useMemo(() => data.images ?? [], [data.images]);

  const { providerId, modelId, supportsVision } = useConnectedModel(id);

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const abortExtractRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      abortExtractRef.current?.abort();
    };
  }, []);

  const update = useCallback(
    (field: string, value: unknown) => updateNodeData(id, { [field]: value }),
    [id, updateNodeData],
  );

  const getCurrentImages = useCallback(
    () => (useCanvasStore.getState().nodes.find((n) => n.id === id)?.data.images as ReferenceImage[]) || [],
    [id],
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const newImages = await Promise.all(
        acceptedFiles.map((file) => readFileAsReferenceImage(file)),
      );
      if (newImages.length === 0) return;
      updateNodeData(id, { images: [...getCurrentImages(), ...newImages] });
    },
    [id, updateNodeData, getCurrentImages],
  );

  const removeImage = useCallback(
    (imageId: string) => {
      updateNodeData(id, { images: getCurrentImages().filter((img) => img.id !== imageId) });
    },
    [id, updateNodeData, getCurrentImages],
  );

  const updateImageDescription = useCallback(
    (imageId: string, description: string) => {
      updateNodeData(id, {
        images: getCurrentImages().map((img) =>
          img.id === imageId ? { ...img, description } : img,
        ),
      });
    },
    [id, updateNodeData, getCurrentImages],
  );

  const handleExtract = useCallback(async () => {
    if (images.length === 0 || !modelId) return;
    const ac = new AbortController();
    abortExtractRef.current?.abort();
    abortExtractRef.current = ac;
    setExtracting(true);
    setExtractError(null);
    try {
      const response = await extractDesignSystem(
        {
          images,
          providerId: providerId!,
          modelId: modelId!,
        },
        { signal: ac.signal },
      );
      if (!response || ac.signal.aborted) return;
      const result = response.result;
      if (content.trim()) {
        update('content', content + '\n\n---\n\n' + result);
      } else {
        update('content', result);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setExtractError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  }, [images, modelId, providerId, content, update]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
  });

  const status = filledOrEmpty(!!content.trim());

  return (
    <NodeShell
      nodeId={id}
      nodeType="designSystem"
      selected={!!selected}
      width="w-node"
      status={status}
      handleColor={content.trim() ? 'green' : 'amber'}
    >
      <NodeHeader
        onRemove={onRemove}
        description="Design tokens, components, and patterns"
      >
        <input
          value={title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="Design System"
          className={`${RF_INTERACTIVE} min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs font-semibold text-fg placeholder:text-fg-faint outline-none hover:border-border focus:border-accent`}
        />
      </NodeHeader>

      {/* Content */}
      <div className="px-3 py-2.5">
        <textarea
          value={content}
          onChange={(e) => update('content', e.target.value)}
          placeholder="Paste design system tokens, or drop images below and click Extract..."
          rows={4}
          className={`${RF_INTERACTIVE} w-full resize-none rounded border border-border px-2.5 py-2 text-xs text-fg-secondary placeholder:text-fg-faint outline-none input-focus`}
        />

        {/* Image upload */}
        <div className={`${RF_INTERACTIVE} mt-2`}>
          {images.length > 0 && (
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
              {isDragActive ? 'Drop images here' : 'Drop reference images or click'}
            </p>
          </div>
        </div>

        {/* Extraction controls */}
        {images.length > 0 && (
          <div className={`${RF_INTERACTIVE} mt-2.5 space-y-2 border-t border-border-subtle pt-2.5`}>
            {!extracting && !modelId && (
              <p className="text-center text-nano text-fg-muted">Connect a Model node</p>
            )}
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={handleExtract}
              disabled={extracting || !modelId}
            >
              {extracting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {extracting ? 'Extracting...' : 'Extract from Images'}
            </Button>

            {!supportsVision && modelId && (
              <p className="text-nano text-warning">
                Model may not support vision.
              </p>
            )}

            {extractError && <NodeErrorBlock message={extractError} />}
          </div>
        )}
      </div>
    </NodeShell>
  );
}

export default memo(DesignSystemNode);
