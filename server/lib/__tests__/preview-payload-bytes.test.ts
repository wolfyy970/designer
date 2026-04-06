import { describe, it, expect } from 'vitest';
import { approximatePreviewFilesUtf8Bytes } from '../preview-payload-bytes.ts';

describe('approximatePreviewFilesUtf8Bytes', () => {
  it('counts ASCII as one byte per char for keys and values', () => {
    expect(approximatePreviewFilesUtf8Bytes({ 'a.txt': 'bc' })).toBe(7);
  });

  it('counts multi-byte UTF-8 in values', () => {
    // é is 2 bytes in UTF-8
    expect(approximatePreviewFilesUtf8Bytes({ 'f': 'é' })).toBe(3);
  });

  it('sums all entries', () => {
    const n = approximatePreviewFilesUtf8Bytes({
      'index.html': '<p>hi</p>',
      'x': 'y',
    });
    expect(n).toBe(Buffer.byteLength('index.html', 'utf8') + Buffer.byteLength('<p>hi</p>', 'utf8') + 1 + 1);
  });
});
