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
import { DocumentViewer } from '@ds/components/ui/document-viewer';
import { StatusPanel, type StatusPanelTone } from '@ds/components/ui/status-panel';
import { useCanvasNodePermanentRemove } from '../../../hooks/useCanvasNodePermanentRemove';
import { STATIC_NODE_DELETE_COPY } from '../../../lib/canvas-permanent-delete-copy';
import { filledOrEmpty } from '../../../lib/node-status';
import {
  computeDesignMdSourceHash,
  designMdSourceHasInput,
  designSystemSourceFromNodeData,
  getDesignMdStatus,
  isDesignMdDocumentStale,
} from '../../../lib/design-md';
import NodeShell from './NodeShell';
import NodeHeader from './NodeHeader';
import { NodeErrorBlock } from './shared/NodeErrorBlock';
import type { ReferenceImage } from '../../../types/spec';
import { useThinkingDefaultsStore } from '../../../stores/thinking-defaults-store';
import Modal from '../../shared/Modal';

type DesignSystemNodeType = Node<DesignSystemNodeData, 'designSystem'>;

function DesignSystemNode({ id, data, selected }: NodeProps<DesignSystemNodeType>) {
  const onRemove = useCanvasNodePermanentRemove(id, STATIC_NODE_DELETE_COPY.designSystem);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const title = data.title || 'Design System';
  const content = data.content || '';
  const images = useMemo(() => data.images ?? [], [data.images]);
  const designMdDocument = data.designMdDocument;
  const designMdSource = useMemo(() => designSystemSourceFromNodeData(data), [data]);

  const { providerId, modelId, supportsVision } = useConnectedModel(id);

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
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
    const currentNode = useCanvasStore.getState().nodes.find((n) => n.id === id);
    const currentData = (currentNode?.data ?? data) as DesignSystemNodeData;
    const source = designSystemSourceFromNodeData(currentData);
    if (!designMdSourceHasInput(source) || !modelId) return;
    const ac = new AbortController();
    abortExtractRef.current?.abort();
    abortExtractRef.current = ac;
    setExtracting(true);
    setExtractError(null);
    const sourceHash = computeDesignMdSourceHash(source);
    try {
      const thinkingOverride = useThinkingDefaultsStore.getState().overrides['design-system'];
      const response = await extractDesignSystem(
        {
          title: source.title,
          content: source.content,
          images: [...(source.images ?? [])],
          sourceHash,
          providerId: providerId!,
          modelId: modelId!,
          thinking: thinkingOverride,
        },
        { signal: ac.signal },
      );
      if (!response || ac.signal.aborted) return;
      update('designMdDocument', {
        content: response.result,
        sourceHash,
        generatedAt: new Date().toISOString(),
        providerId: providerId!,
        modelId: modelId!,
        lint: response.lint,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'DESIGN.md generation failed';
      setExtractError(message);
      update('designMdDocument', {
        content: designMdDocument?.content ?? '',
        sourceHash,
        generatedAt: designMdDocument?.generatedAt ?? new Date().toISOString(),
        providerId: providerId!,
        modelId: modelId!,
        lint: designMdDocument?.lint,
        error: message,
      });
    } finally {
      setExtracting(false);
    }
  }, [data, designMdDocument, id, modelId, providerId, update]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] },
  });

  const designMdStatus = getDesignMdStatus(designMdSource, extracting, designMdDocument);
  const designMdStatusLabel = designMdStatus === 'generating' ? 'generating…' : designMdStatus;
  const designMdStatusTone: StatusPanelTone =
    designMdStatus === 'ready'
      ? 'success'
      : designMdStatus === 'error'
        ? 'error'
        : designMdStatus === 'generating'
          ? 'accent'
          : 'warning';
  const designMdStale = isDesignMdDocumentStale(designMdSource, designMdDocument);
  const hasSourceInput = designMdSourceHasInput(designMdSource);

  const status = filledOrEmpty(hasSourceInput || Boolean(designMdDocument?.content?.trim()));

  return (
    <NodeShell
      nodeId={id}
      nodeType="designSystem"
      selected={!!selected}
      width="w-node"
      status={status}
      handleColor={hasSourceInput || designMdDocument?.content?.trim() ? 'green' : 'amber'}
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
          placeholder="Preferred format: DESIGN.md. Paste DESIGN.md, tokens, style-guide prose, or brand notes..."
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

        {/* DESIGN.md controls */}
        <div className={`${RF_INTERACTIVE} mt-2.5 space-y-2 border-t border-border-subtle pt-2.5`}>
          {!extracting && !modelId && (
            <p className="text-center text-nano text-fg-muted">Connect a Model node</p>
          )}
          <StatusPanel
            title="DESIGN.md"
            status={designMdStatusLabel}
            tone={designMdStatusTone}
            animated={designMdStatus === 'generating'}
            actions={(
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!designMdDocument?.content}
                  onClick={() => setDocumentModalOpen(true)}
                >
                  View
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={extracting || !modelId || !hasSourceInput}
                  onClick={handleExtract}
                >
                  Refresh
                </Button>
              </>
            )}
          >
            {designMdDocument?.error && !extracting ? (
              <span className="text-error">{designMdDocument.error}</span>
            ) : null}
          </StatusPanel>
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={handleExtract}
            disabled={extracting || !modelId || !hasSourceInput}
          >
            {extracting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            {extracting ? 'Generating...' : 'Generate DESIGN.md'}
          </Button>

          {!supportsVision && images.length > 0 && modelId && (
            <p className="text-nano text-warning">
              Model may not support vision.
            </p>
          )}

          {extractError && <NodeErrorBlock message={extractError} />}
        </div>
      </div>
      <Modal
        open={documentModalOpen}
        onClose={() => setDocumentModalOpen(false)}
        title="DESIGN.md"
        size="lg"
      >
        <DocumentViewer
          content={designMdDocument?.content}
          emptyMessage="No DESIGN.md document has been generated yet."
          metadata={
            designMdDocument ? (
              <>
                <div>Generated: {designMdDocument.generatedAt}</div>
                <div>Model: {designMdDocument.providerId} / {designMdDocument.modelId}</div>
                <div>Source: {designMdStale ? 'stale' : 'current'}</div>
                {designMdDocument.lint ? (
                  <div>
                    Lint: {designMdDocument.lint.errors} errors, {designMdDocument.lint.warnings} warnings, {designMdDocument.lint.infos} info
                  </div>
                ) : null}
              </>
            ) : null
          }
        />
      </Modal>
    </NodeShell>
  );
}

export default memo(DesignSystemNode);
