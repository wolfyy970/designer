import type { DesignSystemNodeData } from '../types/canvas-data';
import type { ReferenceImage } from '../types/spec';
import type { DesignMdDocument } from '../types/workspace-domain';

export type DesignMdSource = {
  title?: string;
  content?: string;
  images?: readonly ReferenceImage[];
};

export type DesignMdStatus = 'missing' | 'ready' | 'stale' | 'generating' | 'error';

function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function imageFingerprint(img: ReferenceImage): Record<string, string | number | undefined> {
  return {
    id: img.id,
    filename: img.filename,
    description: img.description,
    extractedContext: img.extractedContext,
    dataUrlHash: hashString(img.dataUrl),
    dataUrlLength: img.dataUrl.length,
  };
}

export function designMdSourcePayload(source: DesignMdSource): unknown {
  return {
    title: source.title ?? '',
    content: source.content ?? '',
    images: (source.images ?? []).map(imageFingerprint),
  };
}

export function computeDesignMdSourceHash(source: DesignMdSource): string {
  return `fnv1a:${hashString(JSON.stringify(designMdSourcePayload(source)))}`;
}

export function isDesignMdDocumentStale(
  source: DesignMdSource,
  doc?: DesignMdDocument,
): boolean {
  if (!doc) return true;
  return doc.sourceHash !== computeDesignMdSourceHash(source);
}

export function designMdSourceHasInput(source: DesignMdSource): boolean {
  return Boolean(source.content?.trim()) || Boolean(source.images?.length);
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
  };
}

