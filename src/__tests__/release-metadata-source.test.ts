import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('release metadata source', () => {
  it('falls back to build time when git and package releasedAt are unavailable', () => {
    const config = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');

    expect(config).toContain('git log -1 --format=%cI');
    expect(config).toContain('pkg.releasedAt');
    expect(config).toContain('new Date().toISOString()');
  });
});
