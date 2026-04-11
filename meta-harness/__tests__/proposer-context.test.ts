import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ARTIFACT } from '../constants.ts';
import {
  formatRubricWeightsContext,
  loadCurrentSkills,
  loadPreviousSessionBests,
  loadRichCandidateHistory,
} from '../proposer-context.ts';

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
      path.join(c0, ARTIFACT.aggregateJson),
      JSON.stringify({ meanScore: 2.5, candidateId: 0 }),
      'utf8',
    );
    await writeFile(path.join(c0, ARTIFACT.promptOverridesJson), JSON.stringify({}), 'utf8');

    const out = await loadRichCandidateHistory(session, 5);
    expect(out).toContain('candidate-0');
    expect(out).toContain('baseline');
    expect(out).toContain('2.500');
    expect(out).toContain('prompt-overrides.json');
  });

  it('ignores corrupt aggregate.json (no crash)', async () => {
    const session = await mkdtemp(path.join(tmpdir(), 'mh-rich-bad-agg-'));
    const c0 = path.join(session, 'candidate-1');
    await mkdir(c0, { recursive: true });
    await writeFile(path.join(c0, ARTIFACT.aggregateJson), '{ not valid aggregate', 'utf8');
    await writeFile(path.join(c0, ARTIFACT.promptOverridesJson), JSON.stringify({}), 'utf8');

    const out = await loadRichCandidateHistory(session, 5);
    expect(out).toContain('candidate-1');
    expect(out).toContain('mean: —');
  });
});

describe('formatRubricWeightsContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('includes weights from GET /api/config when fetch succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            lockdown: false,
            agenticMaxRevisionRounds: 3,
            agenticMinOverallScore: null,
            defaultRubricWeights: {
              design: 0.5,
              strategy: 0.2,
              implementation: 0.2,
              browser: 0.1,
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const ctx = await formatRubricWeightsContext('http://127.0.0.1:3001/api');
    expect(ctx).toContain('## Current rubric weights');
    expect(ctx).toContain('"design": 0.5');
    expect(ctx).toContain('set_rubric_weights');
  });

  it('falls back to merged defaults when config fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const ctx = await formatRubricWeightsContext('http://127.0.0.1:3001/api');
    expect(ctx).toContain('## Current rubric weights');
    expect(ctx).toContain('"design": 0.4');
  });
});

describe('loadCurrentSkills', () => {
  it('lists skill directories and SKILL.md preview', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mh-skills-'));
    const pkg = path.join(root, 'demo-pkg');
    await mkdir(pkg, { recursive: true });
    await writeFile(path.join(pkg, 'SKILL.md'), '# Demo skill\n body', 'utf8');
    const out = await loadCurrentSkills(root);
    expect(out).toContain('demo-pkg');
    expect(out).toContain('Demo skill');
  });
});

describe('loadPreviousSessionBests', () => {
  it('builds a markdown table from prior sessions', async () => {
    const hist = await mkdtemp(path.join(tmpdir(), 'mh-prev-'));
    const sOld = path.join(hist, 'session-old');
    const sNew = path.join(hist, 'session-new');
    await mkdir(sOld, { recursive: true });
    await mkdir(sNew, { recursive: true });
    await writeFile(path.join(sOld, ARTIFACT.promotionReportMd), '# r\n', 'utf8');
    await writeFile(
      path.join(sOld, ARTIFACT.bestCandidateJson),
      JSON.stringify({ meanScore: 3.25, candidateId: 2, updatedAt: '2025-01-02T12:00:00Z' }),
      'utf8',
    );
    await writeFile(
      path.join(sNew, ARTIFACT.bestCandidateJson),
      JSON.stringify({ meanScore: 4.1, candidateId: 1 }),
      'utf8',
    );

    const out = await loadPreviousSessionBests(hist, 'session-new');
    expect(out).toContain('session-old');
    expect(out).toContain('3.250');
    expect(out).toContain('yes');
  });
});
