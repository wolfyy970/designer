import { Buffer } from 'node:buffer';

/** Rough UTF-8 byte size of the `files` map (keys + values). */
export function approximatePreviewFilesUtf8Bytes(files: Record<string, string>): number {
  let n = 0;
  for (const [k, v] of Object.entries(files)) {
    n += Buffer.byteLength(k, 'utf8') + Buffer.byteLength(v, 'utf8');
  }
  return n;
}
