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

    const stale = await scanUnpromotedSessions({
      historyRoot,
      repoRoot: root,
      skillsDir,
    });
    expect(stale).not.toBeNull();
    expect(stale!.staleSkills).toHaveLength(0);
    expect(stale!.staleRubricWeights).not.toBeNull();
    expect(stale!.staleRubricWeights!.winnerWeights.design).toBe(0.35);
    expect(stale!.staleRubricWeights!.liveWeights.design).toBe(0.4);
  });

  it('returns null when no drift (already promoted)', async () => {
    await writeSession({
      folder: 'session-design-z',
      candidateId: 1,
      meanScore: 3.5,
      overrides: {},
    });

    const stale = await scanUnpromotedSessions({
      historyRoot,
      repoRoot: root,
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

    const stale = await scanUnpromotedSessions({
      historyRoot,
      repoRoot: root,
      skillsDir,
    });
    expect(stale).toBeNull();
  });

  it('returns null when history root does not exist', async () => {
    const stale = await scanUnpromotedSessions({
      historyRoot: path.join(root, 'nope'),
      repoRoot: root,
      skillsDir,
    });
    expect(stale).toBeNull();
  });

  it('detects skill drift (modified)', async () => {
    await writeSession({
      folder: 'session-design-z',
      candidateId: 0,
      meanScore: 2,
      overrides: {},
    });

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
      skillsDir,
    });
    expect(stale).not.toBeNull();
    expect(stale!.staleSkills.some((s) => s.relPath === 'pkg/SKILL.md' && s.kind === 'modified')).toBe(true);
  });

  it('returns empty staleSkills when skill tree diff throws', async () => {
    await writeSession({
      folder: 'session-skill-boom',
      candidateId: 1,
      meanScore: 3,
      overrides: {},
    });

    const lib = path.join(root, 'src', 'lib');
    await mkdir(lib, { recursive: true });
    await writeFile(
      path.join(lib, 'rubric-weights.json'),
      `${JSON.stringify({ design: 0.4, strategy: 0.3, implementation: 0.2, browser: 0.1 }, null, 2)}\n`,
      'utf8',
    );
    await writeSession({
      folder: 'session-skill-boom',
      candidateId: 1,
      meanScore: 3,
      overrides: {},
      winnerRubricWeights: { design: 0.35, strategy: 0.3, implementation: 0.25, browser: 0.1 },
    });

    const diffSpy = vi.spyOn(skillDiff, 'diffSkillTrees').mockRejectedValue(new Error('mock disk error'));
    try {
      const stale = await scanUnpromotedSessions({
        historyRoot,
        repoRoot: root,
        skillsDir,
      });
      expect(stale).not.toBeNull();
      expect(stale!.staleSkills).toEqual([]);
      expect(stale!.staleRubricWeights).not.toBeNull();
    } finally {
      diffSpy.mockRestore();
    }
  });
});
