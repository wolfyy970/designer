/**
 * Manual promotion guide: markdown from the winning candidate's artifacts.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { MetaHarnessMode } from './modes.ts';

export type PromotionSummary = {
  candidateId: number;
  meanScore: number;
  promptOverrideKeys: string[];
  skillsAdded: string[];
  skillsModified: string[];
  skillsDeleted: string[];
  testCasesAdded: string[];
  hasChanges: boolean;
};

export type CandidateScoreRow = {
  candidateId: number;
  meanScore: number | null;
  iteration: number;
};

type GeneratePromotionReportOptions = {
  repoRoot: string;
  winningCandidateDir: string;
  winningCandidateId: number;
  winningMeanScore: number;
  mode: MetaHarnessMode;
  candidateRows: CandidateScoreRow[];
  initialTestCaseNames: Set<string>;
  currentTestCasesDir: string;
};

/** Recursively list relative file paths under dir (posix-style slashes). */
async function walkFiles(absDir: string, relPrefix = ''): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = path.join(relPrefix, e.name);
    const full = path.join(absDir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walkFiles(full, rel)));
    } else if (e.isFile()) {
      out.push(rel.split(path.sep).join('/'));
    }
  }
  return out.sort();
}

async function readBinary(p: string): Promise<Buffer | null> {
  try {
    return await readFile(p);
  } catch {
    return null;
  }
}

type TreeDiff = {
  added: string[];
  deleted: string[];
  modified: Array<{ relPath: string; snapshotBytes: number; liveBytes: number }>;
  unchanged: number;
};

export async function diffSkillTrees(snapshotRoot: string, liveRoot: string): Promise<TreeDiff> {
  const snapPaths = new Set(await walkFiles(snapshotRoot));
  const livePaths = new Set(await walkFiles(liveRoot));

  const added: string[] = [];
  const deleted: string[] = [];
  const modified: Array<{ relPath: string; snapshotBytes: number; liveBytes: number }> = [];
  let unchanged = 0;

  for (const rel of snapPaths) {
    if (!livePaths.has(rel)) {
      deleted.push(rel);
      continue;
    }
    const a = await readBinary(path.join(snapshotRoot, rel));
    const b = await readBinary(path.join(liveRoot, rel));
    if (!a || !b) continue;
    if (Buffer.compare(a, b) === 0) unchanged += 1;
    else modified.push({ relPath: rel, snapshotBytes: a.length, liveBytes: b.length });
  }
  for (const rel of livePaths) {
    if (!snapPaths.has(rel)) added.push(rel);
  }
  return { added, deleted, modified, unchanged };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

async function buildPromotionSummary(
  options: Pick<
    GeneratePromotionReportOptions,
    'repoRoot' | 'winningCandidateDir' | 'initialTestCaseNames' | 'currentTestCasesDir' | 'winningCandidateId' | 'winningMeanScore'
  >,
): Promise<PromotionSummary> {
  const { winningCandidateDir, repoRoot, initialTestCaseNames, currentTestCasesDir } = options;

  let promptOverrides: Record<string, string> = {};
  try {
    const raw = await readFile(path.join(winningCandidateDir, 'prompt-overrides.json'), 'utf8');
    promptOverrides = JSON.parse(raw) as Record<string, string>;
  } catch {
    /* empty */
  }
  const promptOverrideKeys = Object.keys(promptOverrides).sort();

  const snapshotSkills = path.join(winningCandidateDir, 'skills-snapshot');
  const liveSkills = path.join(repoRoot, 'skills');
  const tree = await diffSkillTrees(snapshotSkills, liveSkills);

  const currentNames = new Set<string>();
  try {
    const files = await readdir(currentTestCasesDir);
    for (const f of files) {
      if (f.endsWith('.json')) currentNames.add(path.basename(f, '.json'));
    }
  } catch {
    /* ignore */
  }
  const testCasesAdded = [...currentNames].filter((n) => !initialTestCaseNames.has(n)).sort();

  const hasChanges =
    promptOverrideKeys.length > 0 ||
    tree.added.length > 0 ||
    tree.deleted.length > 0 ||
    tree.modified.length > 0 ||
    testCasesAdded.length > 0;

  return {
    candidateId: options.winningCandidateId,
    meanScore: options.winningMeanScore,
    promptOverrideKeys,
    skillsAdded: tree.added,
    skillsModified: tree.modified.map((m) => m.relPath),
    skillsDeleted: tree.deleted,
    testCasesAdded,
    hasChanges,
  };
}

export async function generatePromotionReportMarkdown(
  options: GeneratePromotionReportOptions,
): Promise<{ markdown: string; summary: PromotionSummary }> {
  const { repoRoot, winningCandidateDir, winningCandidateId, winningMeanScore, mode, candidateRows } = options;

  const summary = await buildPromotionSummary(options);
  const tree = await diffSkillTrees(path.join(winningCandidateDir, 'skills-snapshot'), path.join(repoRoot, 'skills'));

  let proposalBody = '';
  try {
    proposalBody = await readFile(path.join(winningCandidateDir, 'proposal.md'), 'utf8');
  } catch {
    proposalBody = '_No proposal.md found._\n';
  }

  let promptOverrides: Record<string, string> = {};
  try {
    const raw = await readFile(path.join(winningCandidateDir, 'prompt-overrides.json'), 'utf8');
    promptOverrides = JSON.parse(raw) as Record<string, string>;
  } catch {
    /* */
  }

  const lines: string[] = [];
  lines.push('# Meta-Harness promotion report');
  lines.push('');
  lines.push('Use this file to **manually** apply the winning candidate into the main app.');
  lines.push('');
  lines.push('## 1. Result summary');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Winning candidate** | \`candidate-${winningCandidateId}\` |`);
  lines.push(`| **Mean score** | ${winningMeanScore >= 0 ? winningMeanScore.toFixed(2) : 'n/a'} |`);
  lines.push(`| **Harness mode** | \`${mode}\` |`);
  lines.push('');
  lines.push('### All candidates (mean score)');
  lines.push('');
  lines.push('| Candidate | Iteration | Mean score |');
  lines.push('|-----------|-----------|------------|');
  const sorted = [...candidateRows].sort((a, b) => a.candidateId - b.candidateId);
  for (const row of sorted) {
    const star = row.candidateId === winningCandidateId ? ' ← **best**' : '';
    const mean = row.meanScore != null && Number.isFinite(row.meanScore) ? row.meanScore.toFixed(2) : 'n/a';
    lines.push(`| candidate-${row.candidateId} | ${row.iteration} | ${mean}${star} |`);
  }
  lines.push('');

  if (winningCandidateId === 0) {
    lines.push('### Interpreting a baseline win');
    lines.push('');
    lines.push(
      '**candidate-0** is the **baseline**: the harness scored the repo (and empty prompt overrides) **before** any proposer iteration. The runner keeps this row as winner unless some **candidate-1+** gets a **strictly higher** mean score (ties leave the baseline ahead). That rule is the same for **compile**, **design**, and **e2e** — only what the mean represents changes by mode, not how the best candidate is picked.',
    );
    lines.push('');
    lines.push(
      'So **baseline as best** means **no proposer iteration in this session beat the baseline on mean score** — not necessarily that the proposer made no edits (later folders may still hold proposals that tied or hurt).',
    );
    lines.push('');
  }

  lines.push('## 2. Prompt overrides');
  lines.push('');
  if (Object.keys(promptOverrides).length === 0) {
    lines.push('_No prompt overrides for this candidate._');
    lines.push('');
  } else {
    lines.push(
      'Paste each body into **`src/lib/prompts/shared-defaults.ts`** inside `PROMPT_DEFAULTS` under the matching key.',
    );
    lines.push('');
    for (const key of Object.keys(promptOverrides).sort()) {
      const body = promptOverrides[key]!;
      lines.push(`### \`${key}\``);
      lines.push('');
      lines.push('```');
      lines.push(body);
      lines.push('```');
      lines.push('');
    }
  }

  lines.push('## 3. Skill changes (winner snapshot vs current `skills/`)');
  lines.push('');
  lines.push(
    `Compared **\`${path.relative(repoRoot, path.join(winningCandidateDir, 'skills-snapshot'))}/\`** (what ran for this candidate) to **\`skills/\`** in the repo **right now** (after the full meta-harness run).`,
  );
  lines.push('');
  if (tree.added.length === 0 && tree.deleted.length === 0 && tree.modified.length === 0) {
    lines.push('_No file differences — trees match, or one side is missing._');
    lines.push('');
  } else {
    if (tree.modified.length) {
      lines.push('### Modified files (content differs)');
      lines.push('');
      lines.push('| File | Size in snapshot | Size in repo now |');
      lines.push('|------|------------------|------------------|');
      for (const m of tree.modified) {
        lines.push(`| \`${m.relPath}\` | ${fmtBytes(m.snapshotBytes)} | ${fmtBytes(m.liveBytes)} |`);
      }
      lines.push('');
      lines.push(
        `To align the repo with **this candidate’s** skills, copy from: \`${path.relative(repoRoot, path.join(winningCandidateDir, 'skills-snapshot'))}/\`.`,
      );
      lines.push('');
    }
    if (tree.added.length) {
      lines.push('### Only in repo `skills/` (not in winner snapshot)');
      lines.push('');
      for (const p of tree.added) lines.push(`- \`${p}\``);
      lines.push('');
    }
    if (tree.deleted.length) {
      lines.push('### Only in winner snapshot (missing from repo now)');
      lines.push('');
      for (const p of tree.deleted) lines.push(`- \`${p}\``);
      lines.push('');
    }
  }

  lines.push('## 4. New test cases since run start');
  lines.push('');
  if (summary.testCasesAdded.length === 0) {
    lines.push('_No new `*.json` files under `meta-harness/test-cases/` since this run began._');
    lines.push('');
  } else {
    for (const n of summary.testCasesAdded) {
      lines.push(`- \`meta-harness/test-cases/${n}.json\``);
    }
    lines.push('');
  }

  lines.push('## 5. How to apply (checklist)');
  lines.push('');
  let step = 1;
  if (Object.keys(promptOverrides).length > 0) {
    lines.push(`${step}. Edit \`src/lib/prompts/shared-defaults.ts\` — update \`PROMPT_DEFAULTS\` for: ${Object.keys(promptOverrides).map((k) => `\`${k}\``).join(', ')}.`);
    step += 1;
    lines.push(`${step}. Run \`pnpm langfuse:sync-prompts\` so Langfuse matches the repo (if you use Langfuse).`);
    step += 1;
  }
  if (tree.modified.length > 0 || tree.deleted.length > 0) {
    lines.push(
      `${step}. Copy needed paths from \`${path.relative(repoRoot, path.join(winningCandidateDir, 'skills-snapshot'))}/\` into \`skills/\` (see section 3).`,
    );
    step += 1;
  } else if (tree.added.length > 0) {
    lines.push(
      `${step}. Review extra files only in \`skills/\` (section 3); remove or keep depending on whether you want the winner’s tree exactly.`,
    );
    step += 1;
  }
  lines.push(`${step}. Run \`pnpm test\` and \`pnpm lint\`.`);
  lines.push('');

  lines.push('## 6. Proposer reasoning (from `proposal.md`)');
  lines.push('');
  lines.push(proposalBody.trimEnd());
  lines.push('');

  return { markdown: lines.join('\n'), summary };
}

/** True if directory exists. */
export async function pathIsDir(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}
