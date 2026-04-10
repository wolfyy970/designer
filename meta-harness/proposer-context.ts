/**
 * Filesystem + API context for the meta-harness proposer (prompt bodies, history, skills).
 */
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { PromptKey } from '../src/lib/prompts/defaults.ts';
import { resolveRubricWeights } from '../server/lib/evaluation-revision-gate.ts';
import { DefaultRubricWeightsSchema } from '../src/api/response-schemas.ts';
import { normalizeError } from '../src/lib/error-utils.ts';
import { ARTIFACT } from './constants.ts';
import type { MetaHarnessMode } from './modes.ts';
import { debugMetaHarness } from './debug-log.ts';
import { getPromptBody } from '../server/lib/prompt-resolution.ts';
import {
  AggregateJsonSchema,
  BestCandidateJsonSchema,
  parsePromptOverridesJsonString,
  RubricWeightsJsonSchema,
  TestCaseSummaryFileSchema,
} from './schemas.ts';

/** Prompt keys the proposer should pre-inject per mode (the edit surfaces). */
export const MODE_PROMPT_KEYS: Record<MetaHarnessMode, PromptKey[]> = {
  incubate: ['hypotheses-generator-system', 'incubator-user-inputs'],
  inputs: [
    'inputs-gen-research-context',
    'inputs-gen-objectives-metrics',
    'inputs-gen-design-constraints',
  ],
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
    'inputs-gen-research-context',
    'inputs-gen-objectives-metrics',
    'inputs-gen-design-constraints',
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

/**
 * Load prompt bodies for edit-surface keys from disk (skills, system prompt, glue templates).
 * Overrides take priority when supplied (from a previous proposer iteration).
 */
export async function loadPromptBodies(
  keys: PromptKey[],
  _apiBaseUrl: string,
  overrides?: Record<string, string>,
): Promise<string> {
  const lines: string[] = ['## Current prompt bodies (your edit surfaces)'];
  for (const key of keys) {
    let body: string;
    if (overrides?.[key]) {
      body = overrides[key]!;
    } else {
      try {
        body = await getPromptBody(key);
      } catch {
        body = '(not found)';
      }
    }
    lines.push(`\n### ${key}\n\`\`\`\n${body}\n\`\`\``);
  }
  return lines.join('\n');
}

async function summarizePerTestResults(candidateDir: string): Promise<string[]> {
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
      const raw: unknown = JSON.parse(await readFile(sumPath, 'utf8'));
      const summary = TestCaseSummaryFileSchema.safeParse(raw);
      if (!summary.success) {
        lines.push(`- **${sub}**: (invalid summary.json)`);
        continue;
      }
      const data = summary.data;
      const score =
        typeof data.overallScore === 'number' && Number.isFinite(data.overallScore)
          ? Number(data.overallScore).toFixed(2)
          : '?';
      const rm = data.rubricMeans;
      let rubricFrag = '';
      if (rm && typeof rm === 'object') {
        rubricFrag = ` · rubrics: ${Object.entries(rm)
          .map(([k, v]) => `${k}=${Number.isFinite(v) ? v.toFixed(2) : '?'}`)
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
      const rawAgg = JSON.parse(await readFile(path.join(cd, ARTIFACT.aggregateJson), 'utf8')) as unknown;
      const agg = AggregateJsonSchema.safeParse(rawAgg);
      if (agg.success) {
        if (typeof agg.data.meanScore === 'number' && Number.isFinite(agg.data.meanScore)) {
          meanLabel = agg.data.meanScore.toFixed(3);
        }
        if (typeof agg.data.candidateId === 'number') cid = agg.data.candidateId;
      }
    } catch (e) {
      debugMetaHarness('rich history aggregate.json skipped:', normalizeError(e));
    }

    const header =
      cid === 0 ? `### ${dir} (baseline, mean: ${meanLabel})` : `### ${dir} (mean: ${meanLabel})`;
    const section: string[] = [header];

    let overrides: Record<string, string> = {};
    try {
      const raw = await readFile(path.join(cd, ARTIFACT.promptOverridesJson), 'utf8');
      overrides = parsePromptOverridesJsonString(raw);
    } catch (e) {
      debugMetaHarness('rich history prompt-overrides skipped:', normalizeError(e));
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
      const rwRaw = await readFile(path.join(cd, ARTIFACT.rubricWeightsJson), 'utf8');
      const rwParsed = RubricWeightsJsonSchema.safeParse(JSON.parse(rwRaw));
      if (rwParsed.success) {
        section.push(`- Rubric weights: \`${JSON.stringify(rwParsed.data)}\``);
      }
    } catch (e) {
      debugMetaHarness('rich history rubric-weights skipped:', normalizeError(e));
    }

    try {
      let prop = await readFile(path.join(cd, ARTIFACT.proposalMd), 'utf8');
      const toolIdx = prop.indexOf('\n## Tool calls');
      if (toolIdx >= 0) prop = prop.slice(0, toolIdx);
      prop = prop.trim();
      if (prop.length > 0) {
        section.push(`- Proposer reasoning (excerpt): ${oneLineExcerpt(prop, PROPOSAL_REASONING_EXCERPT)}`);
      }
    } catch (e) {
      debugMetaHarness('rich history proposal.md skipped:', normalizeError(e));
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
    } catch (e) {
      debugMetaHarness('session bests promotion report access skipped:', normalizeError(e));
    }
    try {
      const raw = JSON.parse(
        await readFile(path.join(historyRootDir, sess, ARTIFACT.bestCandidateJson), 'utf8'),
      ) as unknown;
      const bc = BestCandidateJsonSchema.safeParse(raw);
      if (bc.success) {
        const mean =
          typeof bc.data.meanScore === 'number' && Number.isFinite(bc.data.meanScore)
            ? bc.data.meanScore.toFixed(3)
            : '—';
        const cid = typeof bc.data.candidateId === 'number' ? String(bc.data.candidateId) : '—';
        const upd =
          typeof bc.data.updatedAt === 'string' ? bc.data.updatedAt.slice(0, 19) : '—';
        rows.push(`| ${sess} | ${mean} | ${cid} | ${upd} | ${promo} |`);
      } else {
        rows.push(`| ${sess} | — | — | — | ${promo} |`);
      }
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

const RUBRIC_CONFIG_FETCH_MS = 5_000;

/** Live blend from GET /api/config when reachable; else gate merge of defaults. */
export async function formatRubricWeightsContext(apiBaseUrl: string): Promise<string> {
  const base = apiBaseUrl.replace(/\/$/, '');
  const url = `${base}/config`;
  let resolved = resolveRubricWeights(undefined);
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), RUBRIC_CONFIG_FETCH_MS);
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    if (res.ok) {
      const json: unknown = await res.json();
      const body = json && typeof json === 'object' && 'defaultRubricWeights' in json
        ? (json as { defaultRubricWeights: unknown }).defaultRubricWeights
        : undefined;
      const parsed = DefaultRubricWeightsSchema.safeParse(body);
      if (parsed.success) {
        resolved = { ...parsed.data };
      }
    }
  } catch {
    // fall through to resolveRubricWeights(undefined)
  }

  return [
    '## Current rubric weights (overall score blend for agentic eval)',
    '_Source: GET /api/config `defaultRubricWeights` when API is up; otherwise merged defaults._',
    '```json',
    JSON.stringify(resolved, null, 2),
    '```',
    'Use **set_rubric_weights** with one or more of design, strategy, implementation, browser (non-negative; server renormalizes).',
  ].join('\n');
}
