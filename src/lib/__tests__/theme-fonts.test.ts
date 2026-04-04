import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const cssPath = join(dirname(fileURLToPath(import.meta.url)), '../../index.css');
const indexCss = readFileSync(cssPath, 'utf-8');

describe('index.css theme fonts', () => {
  it('imports body and logo font packages', () => {
    expect(indexCss).toContain('@fontsource-variable/space-grotesk');
    expect(indexCss).toContain('@fontsource/orbitron/500.css');
  });

  it('sets sans stack with Space Grotesk primary and Inter fallback', () => {
    expect(indexCss).toMatch(/--font-sans:\s*"Space Grotesk Variable"/);
    expect(indexCss).toContain('"Inter Variable"');
    expect(indexCss).toContain('"Inter"');
  });

  it('defines logo font token for Orbitron', () => {
    expect(indexCss).toMatch(/--font-logo:\s*"Orbitron"/);
  });
});
