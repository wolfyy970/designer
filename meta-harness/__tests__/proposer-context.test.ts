import { describe, it, expect } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadRichCandidateHistory } from '../proposer-context.ts';

describe('loadRichCandidateHistory', () => {
  it('returns first-run message when dir missing', async () => {
    const out = await loadRichCandidateHistory(path.join(tmpdir(), 'nope-session-xyz'));
    expect(out).toContain('no candidates yet');
  });

  it('formats recent candidate blocks from disk', async () => {
    const session = await mkdtemp(path.join(tmpdir(), 'mh-rich-'));
    const c0 = path.join(session, 'candidate-0');
    await mkdir(c0, { recursive: true });
    await writeFile(
      path.join(c0, 'aggregate.json'),
      JSON.stringify({ meanScore: 2.5, candidateId: 0 }),
      'utf8',
    );
    await writeFile(path.join(c0, 'prompt-overrides.json'), JSON.stringify({}), 'utf8');

    const out = await loadRichCandidateHistory(session, 5);
    expect(out).toContain('candidate-0');
    expect(out).toContain('baseline');
    expect(out).toContain('2.500');
  });

  it('ignores corrupt aggregate.json (no crash)', async () => {
    const session = await mkdtemp(path.join(tmpdir(), 'mh-rich-bad-agg-'));
    const c0 = path.join(session, 'candidate-1');
    await mkdir(c0, { recursive: true });
    await writeFile(path.join(c0, 'aggregate.json'), '{ not valid aggregate', 'utf8');
    await writeFile(path.join(c0, 'prompt-overrides.json'), JSON.stringify({}), 'utf8');

    const out = await loadRichCandidateHistory(session, 5);
    expect(out).toContain('candidate-1');
    expect(out).toContain('mean: —');
  });
});
