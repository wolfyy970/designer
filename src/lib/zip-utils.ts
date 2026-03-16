import { zipSync, strToU8 } from 'fflate';

export function downloadFilesAsZip(files: Record<string, string>, filename: string): void {
  const data: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    data[path] = strToU8(content);
  }
  const zipped = zipSync(data);
  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
