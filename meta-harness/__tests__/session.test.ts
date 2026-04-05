import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nextCandidateId, createMetaHarnessSession } from '../session.ts';
import type { MetaHarnessConfig } from '../schemas.ts';

describe('session helpers', () => {
  it('nextCandidateId returns max+1 from candidate-* folders', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-sess-'));
    await mkdir(path.join(root, 'candidate-0'));
    await mkdir(path.join(root, 'candidate-2'));
    expect(await nextCandidateId(root)).toBe(3);
  });

  it('createMetaHarnessSession writes session.json', async () => {
    const historyRoot = await mkdtemp(path.join(tmpdir(), 'mh-hist-'));
    const cfg: MetaHarnessConfig = {
      apiBaseUrl: 'http://x',
      iterations: 1,
      proposerModel: 'm',
      proposerMaxToolRounds: 3,
      defaultCompilerProvider: 'p',
    };
    const { sessionDir, sessionFolderName } = await createMetaHarnessSession({
      historyRoot,
      mode: 'design',
      cfg,
      iterations: 2,
    });
    expect(sessionFolderName.startsWith('session-')).toBe(true);
    const sj = path.join(sessionDir, 'session.json');
    const raw = JSON.parse(await readFile(sj, 'utf8')) as {
      mode?: string;
      iterations?: number;
    };
    expect(raw.mode).toBe('design');
    expect(raw.iterations).toBe(2);
  });
});
