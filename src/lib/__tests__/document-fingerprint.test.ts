import { describe, expect, it } from 'vitest';
import type { ReferenceImage } from '../../types/spec';
import { hashDocumentSource, imageFingerprint } from '../document-fingerprint';

const image: ReferenceImage = {
  id: 'img-1',
  filename: 'shot.png',
  dataUrl: 'data:image/png;base64,AAAA',
  description: 'Hero screenshot',
  extractedContext: 'Primary CTA',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('document-fingerprint', () => {
  it('keeps the existing image fingerprint shape stable', () => {
    expect(imageFingerprint(image)).toEqual({
      id: 'img-1',
      filename: 'shot.png',
      description: 'Hero screenshot',
      extractedContext: 'Primary CTA',
      dataUrlHash: '0ce4918c',
      dataUrlLength: 26,
    });
  });

  it('keeps source hashes on the existing fnv1a format', () => {
    const payload = {
      title: 'Design System',
      content: 'Use crisp cards.',
      images: [imageFingerprint(image)],
    };

    expect(hashDocumentSource(payload)).toMatch(/^fnv1a:[0-9a-f]{8}$/);
    expect(hashDocumentSource(payload)).toBe(hashDocumentSource(payload));
    expect(hashDocumentSource({ ...payload, content: 'Use soft panels.' })).not.toBe(
      hashDocumentSource(payload),
    );
  });
});
