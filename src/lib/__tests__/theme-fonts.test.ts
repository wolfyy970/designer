import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const cssPath = join(dirname(fileURLToPath(import.meta.url)), '../../index.css');
const indexCss = readFileSync(cssPath, 'utf-8');

describe('index.css theme fonts (Indigo typography triad)', () => {
  it('imports the latin subset that ships the variable font-face declarations', () => {
    expect(indexCss).toContain('./fonts/latin-subsets.css');
    // Orbitron was retired with the Indigo palette swap; it must not be
    // re-imported anywhere in index.css.
    expect(indexCss).not.toContain('orbitron');
  });

  it('sets sans stack to Inter Tight with system fallback', () => {
    expect(indexCss).toMatch(/--font-sans:\s*"Inter Tight Variable"/);
    expect(indexCss).toContain('system-ui');
    // Old stacks must be gone from the @theme block.
    expect(indexCss).not.toContain('Space Grotesk');
    expect(indexCss).not.toContain('"Inter"');
  });

  it('defines Fraunces for --font-logo and --font-display', () => {
    expect(indexCss).toMatch(/--font-logo:\s*"Fraunces Variable"/);
    expect(indexCss).toMatch(/--font-display:\s*"Fraunces Variable"/);
  });

  it('keeps JetBrains Mono as --font-mono', () => {
    expect(indexCss).toMatch(/--font-mono:\s*"JetBrains Mono Variable"/);
  });
});
