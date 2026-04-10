/**
 * Manual promotion guide: markdown from the winning candidate's artifacts.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeError } from '../src/lib/error-utils.ts';
import { ARTIFACT } from './constants.ts';
import { debugMetaHarness } from './debug-log.ts';
import type { MetaHarnessMode } from './modes.ts';
import { parsePromptOverridesJsonString } from './schemas.ts';
import { diffSkillTrees } from './skill-diff.ts';
import {
  parseRubricWeightsJson,
  rubricWeightsDiffer,
  type RubricWeightsRecord,
} from './rubric-weights-compare.ts';
import { EVALUATOR_RUBRIC_IDS } from '../src/types/evaluation.ts';

export type PromotionSummary = {
  candidateId: number;
  meanScore: number;
  promptOverrideKeys: string[];
  skillsAdded: string[];
  skillsModified: string[];
  skillsDeleted: string[];
  testCasesAdded: string[];
  rubricWeightsChanged: boolean;
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

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

type SkillTreeDiffResult = Awaited<ReturnType<typeof diffSkillTrees>>;

type PromotionSummaryContext = {
  summary: PromotionSummary;
  tree: SkillTreeDiffResult;
  promptOverrides: Record<string, string>;
  rubricTable: { live: RubricWeightsRecord; winner: RubricWeightsRecord } | null;
};

async function buildPromotionSummaryWithContext(
  options: Pick<
    GeneratePromotionReportOptions,
    'repoRoot' | 'winningCandidateDir' | 'initialTestCaseNames' | 'currentTestCasesDir' | 'winningCandidateId' | 'winningMeanScore'
  >,
): Promise<PromotionSummaryContext> {
  const { winningCandidateDir, repoRoot, initialTestCaseNames, currentTestCasesDir } = options;

  let promptOverrides: Record<string, string> = {};
  try {
    const raw = await readFile(path.join(winningCandidateDir, ARTIFACT.promptOverridesJson), 'utf8');
    promptOverrides = parsePromptOverridesJsonString(raw);
  } catch (e) {
    debugMetaHarness('promotion prompt-overrides read skipped:', normalizeError(e));
  }
  const promptOverrideKeys = Object.keys(promptOverrides).sort();

  const snapshotSkills = path.join(winningCandidateDir, ARTIFACT.skillsSnapshot);
  const liveSkills = path.join(repoRoot, 'skills');
  const tree = await diffSkillTrees(snapshotSkills, liveSkills);

  const currentNames = new Set<string>();
  try {
    const files = await readdir(currentTestCasesDir);
    for (const f of files) {
      if (f.endsWith('.json')) currentNames.add(path.basename(f, '.json'));
    }
  } catch (e) {
    debugMetaHarness('promotion test-cases dir read skipped:', normalizeError(e));
  }
  const testCasesAdded = [...currentNames].filter((n) => !initialTestCaseNames.has(n)).sort();

  let rubricTable: { live: RubricWeightsRecord; winner: RubricWeightsRecord } | null = null;
  try {
    const winnerRwRaw = await readFile(
      path.join(winningCandidateDir, ARTIFACT.rubricWeightsJson),
      'utf8',
    );
    const liveRwRaw = await readFile(path.join(repoRoot, 'src/lib/rubric-weights.json'), 'utf8');
    const w = parseRubricWeightsJson(winnerRwRaw);
    const l = parseRubricWeightsJson(liveRwRaw);
    if (w && l && rubricWeightsDiffer(l, w)) {
      rubricTable = { live: l, winner: w };
    }
  } catch (e) {
    debugMetaHarness('promotion rubric-weights read skipped:', normalizeError(e));
  }

  const rubricWeightsChanged = rubricTable != null;

  const hasChanges =
    promptOverrideKeys.length > 0 ||
    tree.added.length > 0 ||
    tree.deleted.length > 0 ||
    tree.modified.length > 0 ||
    testCasesAdded.length > 0 ||
    rubricWeightsChanged;

  return {
    summary: {
      candidateId: options.winningCandidateId,
      meanScore: options.winningMeanScore,
      promptOverrideKeys,
      skillsAdded: tree.added,
      skillsModified: tree.modified.map((m) => m.relPath),
      skillsDeleted: tree.deleted,
      testCasesAdded,
      rubricWeightsChanged,
      hasChanges,
    },
    tree,
    promptOverrides,
    rubricTable,
  };
}

export async function generatePromotionReportMarkdown(
  options: GeneratePromotionReportOptions,
): Promise<{ markdown: string; summary: PromotionSummary }> {
  const { repoRoot, winningCandidateDir, winningCandidateId, winningMeanScore, mode, candidateRows } = options;

  const { summary, tree, promptOverrides, rubricTable } = await buildPromotionSummaryWithContext(options);

  let proposalBody = '';
  try {
    proposalBody = await readFile(path.join(winningCandidateDir, ARTIFACT.proposalMd), 'utf8');
  } catch {
    proposalBody = `_No ${ARTIFACT.proposalMd} found._\n`;
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
      'Review each override below. Prompt overrides should now be integrated into the relevant skill file under `skills/` or the system prompt at `prompts/designer-agentic-system/PROMPT.md`.',
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
    `Compared **\`${path.relative(repoRoot, path.join(winningCandidateDir, ARTIFACT.skillsSnapshot))}/\`** (what ran for this candidate) to **\`skills/\`** in the repo **right now** (after the full meta-harness run).`,
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
        `To align the repo with **this candidate’s** skills, copy from: \`${path.relative(repoRoot, path.join(winningCandidateDir, ARTIFACT.skillsSnapshot))}/\`.`,
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

  lines.push('## 4. Rubric weight changes');
  lines.push('');
  if (!rubricTable) {
    lines.push(
      '_Winner `rubric-weights.json` matches repo `src/lib/rubric-weights.json`, or file missing / unreadable._',
    );
    lines.push('');
  } else {
    lines.push(
      'Replace values in **`src/lib/rubric-weights.json`** (or use preflight **P**). Restart the API server so `GET /api/config` serves the new defaults.',
    );
    lines.push('');
    lines.push('| Dimension | Current | Winner |');
    lines.push('|-----------|---------|--------|');
    for (const id of EVALUATOR_RUBRIC_IDS) {
      lines.push(
        `| ${id} | ${rubricTable.live[id].toFixed(4)} | ${rubricTable.winner[id].toFixed(4)} |`,
      );
    }
    lines.push('');
  }

  lines.push('## 5. New test cases since run start');
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

  lines.push('## 6. How to apply (checklist)');
  lines.push('');
  let step = 1;
  if (Object.keys(promptOverrides).length > 0) {
    lines.push(`${step}. Integrate prompt overrides into the relevant skill files under \`skills/\` or \`prompts/designer-agentic-system/PROMPT.md\` for: ${Object.keys(promptOverrides).map((k) => `\`${k}\``).join(', ')}.`);
    step += 1;
  }
  if (tree.modified.length > 0 || tree.deleted.length > 0) {
    lines.push(
      `${step}. Copy needed paths from \`${path.relative(repoRoot, path.join(winningCandidateDir, ARTIFACT.skillsSnapshot))}/\` into \`skills/\` (see section 3).`,
    );
    step += 1;
  } else if (tree.added.length > 0) {
    lines.push(
      `${step}. Review extra files only in \`skills/\` (section 3); remove or keep depending on whether you want the winner’s tree exactly.`,
    );
    step += 1;
  }
  if (rubricTable) {
    lines.push(
      `${step}. Update \`src/lib/rubric-weights.json\` with the winner’s weights (section 4), then **restart the API server**.`,
    );
    step += 1;
  }
  lines.push(`${step}. Run \`pnpm test\` and \`pnpm lint\`.`);
  lines.push('');

  lines.push(`## 7. Proposer reasoning (from \`${ARTIFACT.proposalMd}\`)`);
  lines.push('');
  lines.push(proposalBody.trimEnd());
  lines.push('');

  return { markdown: lines.join('\n'), summary };
}
