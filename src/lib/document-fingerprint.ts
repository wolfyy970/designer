import type { ReferenceImage } from '../types/spec';

export type DocumentImageFingerprint = Record<string, string | number | undefined>;

function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function imageFingerprint(img: ReferenceImage): DocumentImageFingerprint {
  return {
    id: img.id,
    filename: img.filename,
    description: img.description,
    extractedContext: img.extractedContext,
    dataUrlHash: hashString(img.dataUrl),
    dataUrlLength: img.dataUrl.length,
  };
}

export function hashDocumentSource(payload: unknown): string {
  return `fnv1a:${hashString(JSON.stringify(payload))}`;
}
