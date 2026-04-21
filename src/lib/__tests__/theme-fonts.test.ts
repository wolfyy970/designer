import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const testsDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(testsDir, '../..');
const dsDir = join(testsDir, '../../../packages/design-system');

const indexCss = readFileSync(join(srcDir, 'index.css'), 'utf-8');
const generatedTokens = readFileSync(
  join(dsDir, '_generated-tokens.css'),
  'utf-8',
);

describe('index.css import structure', () => {
  it('imports the latin subset that ships the variable font-face declarations', () => {
    expect(indexCss).toContain('./fonts/latin-subsets.css');
    // Orbitron was retired with the Indigo palette swap; it must not be
    // re-imported anywhere in index.css.
    expect(indexCss).not.toContain('orbitron');
  });
});

describe('generated tokens font variables', () => {
  it('sets sans stack to Inter Tight with system fallback', () => {
    expect(generatedTokens).toMatch(/--font-sans:\s*'Inter Tight Variable'/);
    expect(generatedTokens).toContain('system-ui');
    // Old stacks must be gone from the @theme block.
    expect(generatedTokens).not.toContain('Space Grotesk');
    expect(generatedTokens).not.toContain('"Inter"');
  });

  it('defines Fraunces for --font-logo and --font-display', () => {
    expect(generatedTokens).toMatch(/--font-logo:\s*'Fraunces Variable'/);
    expect(generatedTokens).toMatch(/--font-display:\s*'Fraunces Variable'/);
  });

  it('keeps JetBrains Mono as --font-mono', () => {
    expect(generatedTokens).toMatch(/--font-mono:\s*'JetBrains Mono Variable'/);
  });
});
