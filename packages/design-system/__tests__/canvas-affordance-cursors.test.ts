import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const globalsCssPath = resolve(__dirname, '..', 'globals.css');

describe('canvas affordance cursors', () => {
  it('keeps disabled text inputs out of the text-cursor override', () => {
    const globalsCss = readFileSync(globalsCssPath, 'utf8');

    expect(globalsCss).toContain('input:not(:disabled):not([type="checkbox"])');
    expect(globalsCss).toContain('textarea:not(:disabled)');
  });
});
