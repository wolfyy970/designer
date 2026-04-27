import type { DesignSystemNodeData } from '../types/canvas-data';
import type { ReferenceImage } from '../types/spec';
import type { DesignMdDocument } from '../types/workspace-domain';
import { hashDocumentSource, imageFingerprint } from './document-fingerprint';

export type DesignMdSource = {
  title?: string;
  content?: string;
  images?: readonly ReferenceImage[];
};

export type DesignMdStatus = 'missing' | 'ready' | 'stale' | 'generating' | 'error';

export function designMdSourcePayload(source: DesignMdSource): unknown {
  return {
    title: source.title ?? '',
    content: source.content ?? '',
    images: (source.images ?? []).map(imageFingerprint),
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
