import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ARTIFACT } from '../constants.ts';
import * as skillDiff from '../skill-diff.ts';
import { scanUnpromotedSessions } from '../preflight-promotion-check.ts';

describe('scanUnpromotedSessions', () => {
  let root: string;
  let historyRoot: string;
  let skillsDir: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mh-preflight-'));
    historyRoot = path.join(root, 'meta-harness', 'history');
    skillsDir = path.join(root, 'skills');
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function writeSession(opts: {
    folder: string;
    candidateId: number;
    meanScore: number;
    overrides?: Record<string, string>;
    winnerRubricWeights?: Record<string, number>;
  }) {
    const sessionDir = path.join(historyRoot, opts.folder);
    const cand = path.join(sessionDir, `candidate-${opts.candidateId}`);
    await mkdir(cand, { recursive: true });
    await writeFile(
      path.join(sessionDir, ARTIFACT.bestCandidateJson),
      JSON.stringify({ candidateId: opts.candidateId, meanScore: opts.meanScore }, null, 2),
      'utf8',
    );
    await writeFile(path.join(sessionDir, ARTIFACT.promotionReportMd), '# report\n', 'utf8');
    await writeFile(
      path.join(cand, ARTIFACT.promptOverridesJson),
      JSON.stringify(opts.overrides ?? {}, null, 2),
      'utf8',
    );
    await mkdir(path.join(cand, 'skills-snapshot'), { recursive: true });
    if (opts.winnerRubricWeights) {
      await writeFile(
        path.join(cand, ARTIFACT.rubricWeightsJson),
        `${JSON.stringify(opts.winnerRubricWeights, null, 2)}\n`,
        'utf8',
      );
    }
  }

  it('returns stale prompts when live API body differs', async () => {
    await writeSession({
      folder: 'session-design-z',
      candidateId: 1,
      meanScore: 3.5,
      overrides: { 'key-a': 'winner body' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string | URL) => {
        const u = String(url);
        if (u.includes('/prompts/key-a')) {
          return new Response(JSON.stringify({ body: 'different live' }), { status: 200 });
        }
        return new Response(null, { status: 404 });
      }),
    );

    const stale = await scanUnpromotedSessions({
      historyRoot,
      repoRoot: root,
      apiBaseUrl: 'http://127.0.0.1:3001/api',
      skillsDir,
    });
    expect(stale).not.toBeNull();
    expect(stale!.stalePrompts).toHaveLength(1);
    expect(stale!.stalePrompts[0]!.key).toBe('key-a');
    expect(stale!.stalePrompts[0]!.winnerBody).toBe('winner body');
    expect(stale!.stalePrompts[0]!.liveBody).toBe('different live');
    expect(stale!.staleSkills).toHaveLength(0);
  });

  it('returns stale rubric weights when repo file differs from winner', async () => {
    const lib = path.join(root, 'src', 'lib');
    await mkdir(lib, { recursive: true });
    await writeFile(
      path.join(lib, 'rubric-weights.json'),
      `${JSON.stringify(
        { design: 0.4, strategy: 0.3, implementation: 0.2, browser: 0.1 },
        null,
        2,
      )}\n`,
      'utf8',
    );

    await writeSession({
      folder: 'session-rw',
      candidateId: 1,
      meanScore: 3.2,
      overrides: {},
      winnerRubricWeights: { design: 0.35, strategy: 0.3, implementation: 0.25, browser: 0.1 },
    });

    vi.stubGlobal('fetch', vi.fn());

    const stale = await scanUnpromotedSessions({
      historyRoot,
      repoRoot: root,
      apiBaseUrl: 'http://127.0.0.1:3001/api',
      skillsDir,
    });
    expect(stale).not.toBeNull();
    expect(stale!.stalePrompts).toHaveLength(0);
    expect(stale!.staleSkills).toHaveLength(0);
    expect(stale!.staleRubricWeights).not.toBeNull();
    expect(stale!.staleRubricWeights!.winnerWeights.design).toBe(0.35);
    expect(stale!.staleRubricWeights!.liveWeights.design).toBe(0.4);
  });

  it('returns null when live matches winner (already promoted)', async () => {
    await writeSession({
      folder: 'session-design-z',
      candidateId: 1,
      meanScore: 3.5,
      overrides: { 'key-a': 'same' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ body: 'same' }), { status: 200 })),
    );

    const stale = await scanUnpromotedSessions({
      historyRoot,
      repoRoot: root,
      apiBaseUrl: 'http://127.0.0.1:3001/api',
      skillsDir,
    });
    expect(stale).toBeNull();
  });

  it('returns null for invalid best-candidate.json without throwing', async () => {
    const sessionDir = path.join(historyRoot, 'session-bad');
    const cand = path.join(sessionDir, 'candidate-1');
    await mkdir(cand, { recursive: true });
    await writeFile(path.join(sessionDir, ARTIFACT.promotionReportMd), '# r\n', 'utf8');
    await writeFile(path.join(sessionDir, ARTIFACT.bestCandidateJson), 'NOT JSON', 'utf8');
    vi.stubGlobal('fetch', vi.fn());

    const stale = await scanUnpromotedSessions({
      historyRoot,
      repoRoot: root,
      apiBaseUrl: 'http://127.0.0.1:3001/api',
      skillsDir,
    });
    expect(stale).toBeNull();
  });

  it('returns null when history root does not exist', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const stale = await scanUnpromotedSessions({
      historyRoot: path.join(root, 'nope'),
      repoRoot: root,
      apiBaseUrl: 'http://127.0.0.1:3001/api',
      skillsDir,
    });
    expect(stale).toBeNull();
  });

  it('marks fetch error when API fails', async () => {
    await writeSession({
      folder: 'session-design-z',
      candidateId: 1,
      meanScore: 3,
      overrides: { 'key-a': 'winner only' },
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    const stale = await scanUnpromotedSessions({
      historyRoot,
      repoRoot: root,
      apiBaseUrl: 'http://127.0.0.1:3001/api',
      skillsDir,
    });
    expect(stale).not.toBeNull();
    expect(stale!.stalePrompts[0]!.liveBody).toBe('');
    expect(stale!.stalePrompts[0]!.fetchError).toBe('network error');
    expect(stale!.allFetchesFailed).toBe(true);
  });

  it('detects skill drift (modified)', async () => {
    await writeSession({
      folder: 'session-design-z',
      candidateId: 0,
      meanScore: 2,
      overrides: {},
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ body: 'x' }), { status: 200 })),
    );

    const cand = path.join(historyRoot, 'session-design-z', 'candidate-0');
    const snapSub = path.join(cand, 'skills-snapshot', 'pkg');
    await mkdir(snapSub, { recursive: true });
    await writeFile(path.join(snapSub, 'SKILL.md'), 'snapshot skill\n', 'utf8');
    const liveSub = path.join(skillsDir, 'pkg');
    await mkdir(liveSub, { recursive: true });
    await writeFile(path.join(liveSub, 'SKILL.md'), 'live skill\n', 'utf8');

    const stale = await scanUnpromotedSessions({
      historyRoot,
      repoRoot: root,
      apiBaseUrl: 'http://127.0.0.1:3001/api',
      skillsDir,
    });
    expect(stale).not.toBeNull();
    expect(stale!.staleSkills.some((s) => s.relPath === 'pkg/SKILL.md' && s.kind === 'modified')).toBe(true);
  });

  it('returns prompt drift with empty staleSkills when skill tree diff throws', async () => {
    await writeSession({
      folder: 'session-skill-boom',
      candidateId: 1,
      meanScore: 3,
      overrides: { 'k1': 'winner' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ body: 'live-differs' }), { status: 200 })),
    );
    const diffSpy = vi.spyOn(skillDiff, 'diffSkillTrees').mockRejectedValue(new Error('mock disk error'));
    try {
      const stale = await scanUnpromotedSessions({
        historyRoot,
        repoRoot: root,
        apiBaseUrl: 'http://127.0.0.1:3001/api',
        skillsDir,
      });
      expect(stale).not.toBeNull();
      expect(stale!.stalePrompts.length).toBeGreaterThan(0);
      expect(stale!.staleSkills).toEqual([]);
    } finally {
      diffSpy.mockRestore();
    }
  });
});
