import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const globalsCssPath = resolve(rootDir, 'globals.css');

function semanticAliasBlock(css: string): string {
  const match = css.match(/\/\* ── Semantic aliases[\s\S]*?:root\s*\{([\s\S]*?)\n\}\n\n\/\* ── @theme inline/);
  if (!match) throw new Error('Could not find semantic aliases :root block in globals.css');
  return match[1];
}

describe('status token aliases', () => {
  it('does not redefine base status tokens as self-referential semantic aliases', () => {
    const globalsCss = readFileSync(globalsCssPath, 'utf8');
    const block = semanticAliasBlock(globalsCss);

    expect(block).not.toMatch(/--color-(success|warning|error|info)\s*:\s*var\(\s*--color-\1\s*\)\s*;/);
  });
});
