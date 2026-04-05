/**
 * Filesystem + API context for the meta-harness proposer (prompt bodies, history, skills).
 */
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PromptKey } from '../src/lib/prompts/defaults.ts';
import { PROMPT_DEFAULTS } from '../src/lib/prompts/shared-defaults.ts';
import { resolveRubricWeights } from '../server/lib/evaluation-revision-gate.ts';
import { ARTIFACT } from './constants.ts';
import type { MetaHarnessMode } from './modes.ts';

/** Prompt keys the proposer should pre-inject per mode (the edit surfaces). */
export const MODE_PROMPT_KEYS: Record<MetaHarnessMode, PromptKey[]> = {
  compile: ['hypotheses-generator-system', 'incubator-user-inputs'],
  design: [
    'designer-agentic-system',
    'designer-hypothesis-inputs',
    'designer-agentic-revision-user',
    'agents-md-file',
    'evaluator-design-quality',
    'evaluator-strategy-fidelity',
    'evaluator-implementation',
  ],
  e2e: [
    'hypotheses-generator-system',
    'incubator-user-inputs',
    'designer-agentic-system',
    'designer-hypothesis-inputs',
    'designer-agentic-revision-user',
    'agents-md-file',
    'evaluator-design-quality',
    'evaluator-strategy-fidelity',
    'evaluator-implementation',
  ],
};

const OVERRIDE_BODY_EXCERPT = 200;
const PROPOSAL_REASONING_EXCERPT = 320;

function oneLineExcerpt(text: string, maxChars: number): string {
  const one = text.replace(/\s+/g, ' ').trim();
  if (one.length <= maxChars) return one;
  return `${one.slice(0, Math.max(0, maxChars - 1))}…`;
}

/** Labeled prompt body from GET /api/prompts/:key (Langfuse when configured). */
async function fetchPromptBodyFromApi(apiBaseUrl: string, key: PromptKey): Promise<string | null> {
  const base = apiBaseUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/prompts/${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { body?: unknown };
    if (typeof data.body !== 'string' || data.body.length === 0) return null;
    return data.body;
  } catch {
    return null;
  }
}

/**
 * Load prompt bodies for edit-surface keys: live from the API (Langfuse-backed) when reachable,
 * else fall back to repo `PROMPT_DEFAULTS`.
 */
export async function loadPromptBodies(
  keys: PromptKey[],
  apiBaseUrl: string,
  overrides?: Record<string, string>,
): Promise<string> {
  const lines: string[] = ['## Current prompt bodies (your edit surfaces)'];
  for (const key of keys) {
    let body: string;
    if (overrides?.[key]) {
      body = overrides[key]!;
    } else {
      const live = await fetchPromptBodyFromApi(apiBaseUrl, key);
      body = live ?? PROMPT_DEFAULTS[key] ?? '(not found)';
    }
    lines.push(`\n### ${key}\n\`\`\`\n${body}\n\`\`\``);
  }
  return lines.join('\n');
}

export async function summarizePerTestResults(candidateDir: string): Promise<string[]> {
  const trRoot = path.join(candidateDir, 'test-results');
  const lines: string[] = [];
  let subs: string[];
  try {
    subs = await readdir(trRoot);
  } catch {
    return lines;
  }
  for (const sub of subs.sort()) {
    const sumPath = path.join(trRoot, sub, 'summary.json');
    try {
      const raw = JSON.parse(await readFile(sumPath, 'utf8')) as {
        overallScore?: unknown;
        rubricMeans?: Record<string, number>;
      };
      const score =
        typeof raw.overallScore === 'number' && Number.isFinite(raw.overallScore)
          ? Number(raw.overallScore).toFixed(2)
          : '?';
      const rm = raw.rubricMeans;
      let rubricFrag = '';
      if (rm && typeof rm === 'object') {
        rubricFrag = ` · rubrics: ${Object.entries(rm)
          .map(([k, v]) => `${k}=${typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '?'}`)
          .join(', ')}`;
      }
      lines.push(`- **${sub}**: overall ${score}${rubricFrag}`);
    } catch {
      lines.push(`- **${sub}**: (no summary.json)`);
    }
  }
  return lines;
}

/**
 * Rich context from this session only: overrides, per-test scores / rubric means, proposer reasoning.
 * `sessionHistoryDir` is `meta-harness/history/session-…/`.
 */
export async function loadRichCandidateHistory(sessionHistoryDir: string, max = 5): Promise<string> {
  let entries: string[];
  try {
    entries = await readdir(sessionHistoryDir);
  } catch {
    return '## Current session history\n(no candidates yet — you are on the first proposer iteration after baseline)';
  }
  const dirs = entries
    .filter((e) => /^candidate-\d+$/.test(e))
    .sort((a, b) => {
      const na = parseInt(a.split('-')[1] ?? '0', 10);
      const nb = parseInt(b.split('-')[1] ?? '0', 10);
      return na - nb;
    });
  if (dirs.length === 0) {
    return '## Current session history\n(no candidates yet — you are on the first proposer iteration after baseline)';
  }

  const recent = dirs.slice(-max);
  const blocks: string[] = ['## Current session history (most recent first — same run only)'];

  for (const dir of [...recent].reverse()) {
    const cd = path.join(sessionHistoryDir, dir);
    let meanLabel = '—';
    let cid = -1;
    try {
      const agg = JSON.parse(await readFile(path.join(cd, 'aggregate.json'), 'utf8')) as {
        meanScore?: unknown;
        candidateId?: unknown;
      };
      if (typeof agg.meanScore === 'number' && Number.isFinite(agg.meanScore)) {
        meanLabel = agg.meanScore.toFixed(3);
      }
      if (typeof agg.candidateId === 'number') cid = agg.candidateId;
    } catch {
      /* ignore */
    }

    const header =
      cid === 0 ? `### ${dir} (baseline, mean: ${meanLabel})` : `### ${dir} (mean: ${meanLabel})`;
    const section: string[] = [header];

    let overrides: Record<string, string> = {};
    try {
      overrides = JSON.parse(await readFile(path.join(cd, 'prompt-overrides.json'), 'utf8')) as Record<
        string,
        string
      >;
    } catch {
      /* ignore */
    }
    const ovKeys = Object.keys(overrides);
    if (ovKeys.length === 0 && cid === 0) {
      section.push('- Prompt overrides: (none — baseline uses live Langfuse / defaults only)');
    } else if (ovKeys.length === 0) {
      section.push('- Prompt overrides: (none this candidate)');
    } else {
      section.push('- Prompt overrides:');
      for (const k of ovKeys) {
        const body = overrides[k] ?? '';
        section.push(
          `  - \`${k}\`: ${body.length} chars — "${oneLineExcerpt(body, OVERRIDE_BODY_EXCERPT)}"`,
        );
      }
    }

    try {
      const rwRaw = await readFile(path.join(cd, 'rubric-weights.json'), 'utf8');
      const rw = JSON.parse(rwRaw) as Record<string, number>;
      section.push(`- Rubric weights: \`${JSON.stringify(rw)}\``);
    } catch {
      /* no rubric-weights.json */
    }

    try {
      let prop = await readFile(path.join(cd, 'proposal.md'), 'utf8');
      const toolIdx = prop.indexOf('\n## Tool calls');
      if (toolIdx >= 0) prop = prop.slice(0, toolIdx);
      prop = prop.trim();
      if (prop.length > 0) {
        section.push(`- Proposer reasoning (excerpt): ${oneLineExcerpt(prop, PROPOSAL_REASONING_EXCERPT)}`);
      }
    } catch {
      /* no proposal */
    }

    const perTest = await summarizePerTestResults(cd);
    if (perTest.length > 0) {
      section.push('- Per-test results:');
      section.push(...perTest);
    }

    blocks.push(section.join('\n'));
  }

  return blocks.join('\n\n');
}

/** Best mean per prior session (sibling `session-*` dirs under history root). */
export async function loadPreviousSessionBests(
  historyRootDir: string,
  excludeSessionFolder: string,
): Promise<string> {
  let entries: string[];
  try {
    entries = await readdir(historyRootDir);
  } catch {
    return '';
  }
  const sessions = entries
    .filter((e) => /^session-/.test(e) && e !== excludeSessionFolder)
    .sort((a, b) => b.localeCompare(a));
  if (sessions.length === 0) return '';

  const rows: string[] = [
    '## Previous session bests (reference only — config / prompts may have changed)',
    '| Session | Best mean | Candidate id | Updated | Promotion report |',
    '|---|---|---|---|---|',
  ];
  for (const sess of sessions.slice(0, 20)) {
    let promo = '—';
    try {
      await access(path.join(historyRootDir, sess, ARTIFACT.promotionReportMd));
      promo = 'yes';
    } catch {
      /* no report */
    }
    try {
      const raw = JSON.parse(
        await readFile(path.join(historyRootDir, sess, 'best-candidate.json'), 'utf8'),
      ) as { meanScore?: number; candidateId?: number; updatedAt?: string };
      const mean = typeof raw.meanScore === 'number' ? raw.meanScore.toFixed(3) : '—';
      const cid = typeof raw.candidateId === 'number' ? String(raw.candidateId) : '—';
      const upd = typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 19) : '—';
      rows.push(`| ${sess} | ${mean} | ${cid} | ${upd} | ${promo} |`);
    } catch {
      rows.push(`| ${sess} | — | — | — | ${promo} |`);
    }
  }
  rows.push(
    '',
    '_Promotion report_: **`meta-harness/history/<session>/PROMOTION_REPORT.md`** (session root). Use **read_file** on that path to open a prior run’s checklist.',
  );
  return rows.join('\n');
}

/** List skills and optionally include their SKILL.md bodies (capped). */
export async function loadCurrentSkills(skillsDir: string, includeBodies = true): Promise<string> {
  let keys: string[];
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    keys = entries.filter((e) => e.isDirectory()).map((e) => String(e.name));
  } catch {
    return '## Current skills\n(skills/ directory not found)';
  }
  if (keys.length === 0) return '## Current skills\n(none)';

  const lines: string[] = [`## Current skills (${keys.length} total)`];
  for (const key of keys) {
    if (!includeBodies) {
      lines.push(`- ${key}`);
      continue;
    }
    try {
      const body = await readFile(path.join(skillsDir, key, 'SKILL.md'), 'utf8');
      const preview = body.length > 600 ? `${body.slice(0, 600)}\n…(truncated)` : body;
      lines.push(`\n### skills/${key}/SKILL.md\n${preview}`);
    } catch {
      lines.push(`- ${key} (SKILL.md unreadable)`);
    }
  }
  return lines.join('\n');
}

export function formatRubricWeightsContext(): string {
  const r = resolveRubricWeights(undefined);
  return [
    '## Current rubric weights (overall score blend for agentic eval)',
    '```json',
    JSON.stringify(r, null, 2),
    '```',
    'Use **set_rubric_weights** with one or more of design, strategy, implementation, browser (non-negative; server renormalizes).',
  ].join('\n');
}
