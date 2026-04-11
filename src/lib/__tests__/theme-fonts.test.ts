import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const cssPath = join(dirname(fileURLToPath(import.meta.url)), '../../index.css');
const indexCss = readFileSync(cssPath, 'utf-8');

describe('index.css theme fonts', () => {
  it('imports latin subset + logo font packages', () => {
    expect(indexCss).toContain('./fonts/latin-subsets.css');
    expect(indexCss).toContain('@fontsource/orbitron/latin-500.css');
  });

  it('sets sans stack with Space Grotesk primary and system fallback', () => {
    expect(indexCss).toMatch(/--font-sans:\s*"Space Grotesk Variable"/);
    expect(indexCss).toContain('system-ui');
    expect(indexCss).not.toContain('"Inter"');
  });

  it('defines logo font token for Orbitron', () => {
    expect(indexCss).toMatch(/--font-logo:\s*"Orbitron"/);
  });
});
