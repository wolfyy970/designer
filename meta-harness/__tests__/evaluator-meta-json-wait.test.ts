import { access, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { waitForMetaJson } from '../evaluator.ts';

describe('waitForMetaJson', () => {
  it('returns true once meta.json appears and invokes onWaiting while polling', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mh-meta-wait-'));
    try {
      const waits: number[] = [];
      const metaPath = path.join(dir, 'meta.json');

      const pending = waitForMetaJson(dir, 5000, 80, (sec) => {
        waits.push(sec);
      });

      await new Promise((r) => setTimeout(r, 120));
      await writeFile(metaPath, '{}', 'utf8');

      const ok = await pending;
      expect(ok).toBe(true);
      await access(metaPath);
      expect(waits.length).toBeGreaterThanOrEqual(1);
      expect(waits[0]).toBeGreaterThanOrEqual(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns false on timeout and still called onWaiting', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mh-meta-timeout-'));
    await mkdir(dir, { recursive: true });
    try {
      const waits: number[] = [];
      const ok = await waitForMetaJson(dir, 200, 50, (sec) => waits.push(sec));
      expect(ok).toBe(false);
      expect(waits.length).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
