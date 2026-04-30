import type { DesignSystemNodeData } from '../types/canvas-data';
import type { DesignSystemMarkdownSource } from '../types/design-system-source';
import type { ReferenceImage } from '../types/spec';
import type { DesignMdDocument } from '../types/workspace-domain';
import { hashDocumentSource, imageFingerprint } from './document-fingerprint';

export type DesignMdSource = {
  title?: string;
  content?: string;
  images?: readonly ReferenceImage[];
  markdownSources?: readonly DesignSystemMarkdownSource[];
};

export type DesignMdStatus = 'missing' | 'ready' | 'stale' | 'generating' | 'error';

function markdownSourceFingerprint(source: DesignSystemMarkdownSource) {
  return {
    id: source.id,
    filename: source.filename,
    content: source.content,
    sizeBytes: source.sizeBytes,
  };
}

export function designMdSourcePayload(source: DesignMdSource): unknown {
  return {
    title: source.title ?? '',
    content: source.content ?? '',
    images: (source.images ?? []).map(imageFingerprint),
    markdownSources: (source.markdownSources ?? []).map(markdownSourceFingerprint),
  };
}

export function computeDesignMdSourceHash(source: DesignMdSource): string {
  return hashDocumentSource(designMdSourcePayload(source));
}

export function isDesignMdDocumentStale(
  source: DesignMdSource,
  doc?: DesignMdDocument,
): boolean {
  if (!doc) return true;
  return doc.sourceHash !== computeDesignMdSourceHash(source);
}

export function designMdSourceHasInput(source: DesignMdSource): boolean {
  return (
    Boolean(source.content?.trim()) ||
    Boolean(source.images?.length) ||
    Boolean(source.markdownSources?.some((asset) => asset.content.trim()))
  );
}

export function getDesignMdStatus(
  source: DesignMdSource,
  generating: boolean,
  doc?: DesignMdDocument,
): DesignMdStatus {
  if (generating) return 'generating';
  if (doc?.error) return 'error';
  if (!doc?.content?.trim()) return 'missing';
  return isDesignMdDocumentStale(source, doc) ? 'stale' : 'ready';
}

export function designSystemSourceFromNodeData(data: DesignSystemNodeData): DesignMdSource {
  return {
    title: data.title,
    content: data.content,
    images: data.images ?? [],
    markdownSources: data.markdownSources ?? [],
  };
}

export function formatDesignSystemSourceMarkdown(source: DesignMdSource): string {
  const parts: string[] = [];
  if (source.content?.trim()) parts.push(source.content.trim());
  for (const asset of source.markdownSources ?? []) {
    if (!asset.content.trim()) continue;
    parts.push(`## Markdown source: ${asset.filename}\n${asset.content.trim()}`);
  }
  return parts.join('\n\n---\n\n');
}
