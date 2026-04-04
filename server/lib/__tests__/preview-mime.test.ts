import { describe, it, expect } from 'vitest';
import { mimeForPath } from '../preview-mime.ts';

describe('mimeForPath', () => {
  it.each([
    ['page.html', 'text/html'],
    ['PAGE.HTM', 'text/html'],
    ['styles.css', 'text/css'],
    ['app.mjs', 'text/javascript'],
    ['data.json', 'application/json'],
    ['icon.svg', 'image/svg+xml'],
    ['font.woff2', 'font/woff2'],
    ['unknown.bin', 'application/octet-stream'],
  ])('maps %s', (path, prefix) => {
    expect(mimeForPath(path).startsWith(prefix)).toBe(true);
  });
});
