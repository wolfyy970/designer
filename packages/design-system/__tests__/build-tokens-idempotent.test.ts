import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const tokensCssPath = resolve(rootDir, '_generated-tokens.css');
const buildScript = resolve(rootDir, 'build-tokens.mjs');

describe('build-tokens idempotency', () => {
  it('produces byte-identical _generated-tokens.css across two runs', () => {
    // Snapshot before so we restore even if the expect throws — a failing
    // idempotency test must not leave the working tree dirty.
    const before = readFileSync(tokensCssPath);

    try {
      execFileSync('node', [buildScript], { cwd: rootDir, encoding: 'utf8' });
      const first = readFileSync(tokensCssPath);

      execFileSync('node', [buildScript], { cwd: rootDir, encoding: 'utf8' });
      const second = readFileSync(tokensCssPath);

      expect(first.toString()).toBe(second.toString());
    } finally {
      writeFileSync(tokensCssPath, before);
    }
  });
});
