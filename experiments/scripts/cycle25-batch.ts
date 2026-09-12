#!/usr/bin/env tsx
/**
 * Cycle 25 Phase A — 300-hypothesis end-to-end validation on the new
 * research-grounded brief portfolio.
 *
 *   20 briefs × 3 reps × 5 hypotheses = 300 hypotheses across 60 cells
 *
 * Each cell loads the brief plus its three companion documents
 * (`<id>-research.md`, `<id>-objectives.md`, `<id>-constraints.md`) so
 * the system gets the full input-node packet, not just the brief.
 *
 * Runs concurrency=6 in-process (cycle 24 proved 4 was safe; the studio
 * has headroom for 6). Aggregates honesty verdicts into a single report
 * at `experiments/runs/cycle25-aggregate/aggregate.md` plus a manifest
 * at `manifest.json` for later re-aggregation.
 *
 * Usage on the studio:
 *   pnpm tsx experiments/scripts/cycle25-batch.ts
 *
 * Optional flags:
 *   --briefs a,b,c        — override the default 20-brief portfolio
 *   --reps N              — override reps-per-brief (default 3)
 *   --concurrency N       — override in-flight limit (default 6)
 *   --count N             — hypotheses per cell (default 5)
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { runOneCell, type CellSpec, type RunOneCellResult } from './matrix-runner.ts';
import { DEFAULT_PER_RUN_TOKEN_CAP } from '../src/cost.ts';
import taskDefaults from '../../config/task-defaults.json';

const REPO_ROOT = process.cwd();
const BRIEFS_DIR = join(REPO_ROOT, 'experiments', 'briefs');
const RUNS_DIR = join(REPO_ROOT, 'experiments', 'runs');

/** The 20 research-grounded briefs added in cycle 25. */
const DEFAULT_BRIEFS = [
  'snap-application',
  'hospital-discharge',
  'deceased-accounts',
  'remote-onboarding-week-one',
  'unemployment-insurance',
  'apartment-with-eviction',
  'primary-care-search',
  'pre-travel-prescription',
  'housing-court-defense',
  'voter-name-change',
  'dmv-cross-state',
  'crisis-line-first-contact',
  'type-2-first-90-days',
  'first-manager-review',
  'retro-after-miss',
  'multi-currency-expense',
  'credit-report-dispute',
  'cc-adult-reentry',
  'parent-finding-tutor',
  'caregiver-coordination',
] as const;

const DEFAULT_REPS = 3;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_COUNT = 5;

// Single-run cap generous for build-stage prototypes; daily cap sized for
// the full 300-hypothesis batch with headroom.
const PER_RUN_CAP_TOKENS = 1_500_000;
const DAILY_CAP_TOKENS = 200_000_000;

// ── CLI parsing ──────────────────────────────────────────────────────────

function readFlag(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  if (i === -1 || !argv[i + 1]) return undefined;
  return argv[i + 1];
}

function resolveBriefs(): readonly string[] {
  const raw = readFlag('--briefs');
  if (!raw) return DEFAULT_BRIEFS;
  const list = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  return list.length === 0 ? DEFAULT_BRIEFS : list;
}

function resolveInt(flag: string, fallback: number): number {
  const raw = readFlag(flag);
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const BRIEFS = resolveBriefs();
const REPS_PER_BRIEF = resolveInt('--reps', DEFAULT_REPS);
const CONCURRENCY = resolveInt('--concurrency', DEFAULT_CONCURRENCY);
const HYPOTHESIS_COUNT = resolveInt('--count', DEFAULT_COUNT);

// ── Cell definition ───────────────────────────────────────────────────────

interface Cell {
  brief: string;
  rep: number;
  spec: CellSpec;
}

/**
 * Build a cell for one (brief, rep) pair. Wires in the research /
 * objectives / constraints companion files if they exist on disk so the
 * system gets the full input-node packet.
 */
function buildCell(brief: string, rep: number): Cell {
  const briefPath = join(BRIEFS_DIR, `${brief}.md`);
  if (!existsSync(briefPath)) {
    throw new Error(`Brief not found: ${briefPath}`);
  }
  const researchPath = join(BRIEFS_DIR, `${brief}-research.md`);
  const objectivesPath = join(BRIEFS_DIR, `${brief}-objectives.md`);
  const constraintsPath = join(BRIEFS_DIR, `${brief}-constraints.md`);
  return {
    brief,
    rep,
    spec: {
      flow: 'ideation',
      briefPath,
      researchPath: existsSync(researchPath) ? researchPath : undefined,
      objectivesPath: existsSync(objectivesPath) ? objectivesPath : undefined,
      constraintsPath: existsSync(constraintsPath) ? constraintsPath : undefined,
      count: HYPOTHESIS_COUNT,
      evaluate: false,
      build: true,
      perRunCapTokens: PER_RUN_CAP_TOKENS,
      dailyCapTokens: DAILY_CAP_TOKENS,
      providerId: 'openrouter',
      modelId: taskDefaults.perTaskDefaults.design.modelId,
    },
  };
}

function buildCells(): Cell[] {
  const cells: Cell[] = [];
  for (const brief of BRIEFS) {
    for (let rep = 1; rep <= REPS_PER_BRIEF; rep++) {
      cells.push(buildCell(brief, rep));
    }
  }
  return cells;
}

// ── Concurrency limiter ──────────────────────────────────────────────────

interface CellOutcome {
  brief: string;
  rep: number;
  result?: RunOneCellResult;
  error?: string;
  wallSec: number;
}

async function runWithConcurrency(
  cells: Cell[],
  limit: number,
  onCellStart: (c: Cell, slot: number, idx: number, total: number) => void,
  onCellEnd: (outcome: CellOutcome, slot: number, idx: number, total: number) => void,
): Promise<CellOutcome[]> {
  const outcomes: CellOutcome[] = new Array(cells.length);
  let nextIndex = 0;

  async function worker(slot: number): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= cells.length) return;
      const cell = cells[i];
      onCellStart(cell, slot, i, cells.length);
      const t0 = Date.now();
      try {
        const result = await runOneCell(cell.spec);
        outcomes[i] = {
          brief: cell.brief,
          rep: cell.rep,
          result,
          wallSec: (Date.now() - t0) / 1000,
        };
      } catch (err) {
        outcomes[i] = {
          brief: cell.brief,
          rep: cell.rep,
          error: err instanceof Error ? err.message : String(err),
          wallSec: (Date.now() - t0) / 1000,
        };
      }
      onCellEnd(outcomes[i], slot, i, cells.length);
    }
  }

  const workers = Array.from({ length: limit }, (_, slot) => worker(slot));
  await Promise.all(workers);
  return outcomes;
}

// ── Aggregation ──────────────────────────────────────────────────────────

interface HypothesisRow {
  brief: string;
  rep: number;
  runId: string;
  hypothesisName: string;
  hypothesisId: string;
  verdict: 'clean' | 'minor' | 'hollow' | 'unknown' | 'no-verdict';
  findingsCount: number | null;
  findingsBlurb?: string;
  errorNote?: string;
}

function parseHonestyRowsFromSummary(
  summaryPath: string,
): Map<string, { name: string; verdict: HypothesisRow['verdict']; findings: number | null }> {
  const out = new Map<string, { name: string; verdict: HypothesisRow['verdict']; findings: number | null }>();
  if (!existsSync(summaryPath)) return out;
  const summary = readFileSync(summaryPath, 'utf8');
  const sectionRe = /^### \[([^\]]+)\]\(artifacts\/([^/)]+)\/[^)]*\)$/gm;
  const ranges: { name: string; id: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(summary))) {
    ranges.push({ name: m[1], id: m[2], start: m.index, end: -1 });
  }
  for (let i = 0; i < ranges.length; i++) {
    ranges[i].end = i + 1 < ranges.length ? ranges[i + 1].start : summary.length;
    const block = summary.slice(ranges[i].start, ranges[i].end);
    const line = block.match(/-\s*\*\*honesty\*\*:\s*([^\n]+)/)?.[1] ?? '';
    let verdict: HypothesisRow['verdict'] = 'no-verdict';
    if (/🔴|hollow/i.test(line)) verdict = 'hollow';
    else if (/🟡|minor/i.test(line)) verdict = 'minor';
    else if (/✅|clean/i.test(line)) verdict = 'clean';
    else if (/⚪|unknown/i.test(line)) verdict = 'unknown';
    const findings = line.match(/\((\d+)\s+find/)?.[1];
    out.set(ranges[i].id, {
      name: ranges[i].name,
      verdict,
      findings: findings ? parseInt(findings, 10) : null,
    });
  }
  return out;
}

function findingsBlurbFor(runRoot: string, hypothesisId: string): string | undefined {
  const transcripts = join(runRoot, 'transcripts');
  if (!existsSync(transcripts)) return undefined;
  let chosen: string | null = null;
  try {
    const files = readdirSync(transcripts).filter((f) => /honesty-.*\.md$/i.test(f));
    const idShort = hypothesisId.slice(0, 6);
    chosen = files.find((f) => f.includes(idShort)) ?? files[0] ?? null;
  } catch {
    return undefined;
  }
  if (!chosen) return undefined;
  let raw = '';
  try {
    raw = readFileSync(join(transcripts, chosen), 'utf8');
  } catch {
    return undefined;
  }
  const respMatch = raw.match(/## Response\s*```text\s*([\s\S]*?)```/);
  if (!respMatch) return undefined;
  try {
    const verdict = JSON.parse(respMatch[1]) as {
      findings?: Array<{ file?: string; line?: number; comment?: string; severity?: string }>;
    };
    if (!verdict.findings || verdict.findings.length === 0) return undefined;
    return verdict.findings
      .map(
        (f) =>
          `\`${f.severity ?? '?'}\` ${f.file ?? ''}:${f.line ?? '?'} — ${(f.comment ?? '').slice(0, 160)}`,
      )
      .join('\n      ');
  } catch {
    return undefined;
  }
}

function collectRows(outcomes: CellOutcome[]): HypothesisRow[] {
  const rows: HypothesisRow[] = [];
  for (const o of outcomes) {
    if (o.error || !o.result) {
      rows.push({
        brief: o.brief,
        rep: o.rep,
        runId: o.result?.runId ?? '(no-run-id)',
        hypothesisName: '(run failed)',
        hypothesisId: '',
        verdict: 'no-verdict',
        findingsCount: null,
        errorNote: o.error ?? o.result?.fatalError,
      });
      continue;
    }
    const runRoot = o.result.runRoot;
    const honestyByHyp = parseHonestyRowsFromSummary(join(runRoot, 'summary.md'));
    if (honestyByHyp.size === 0) {
      rows.push({
        brief: o.brief,
        rep: o.rep,
        runId: o.result.runId,
        hypothesisName: '(no honesty rows in summary)',
        hypothesisId: '',
        verdict: 'no-verdict',
        findingsCount: null,
        errorNote: o.result.fatalError,
      });
      continue;
    }
    for (const [id, info] of honestyByHyp.entries()) {
      const interesting = info.verdict === 'hollow' || info.verdict === 'minor';
      rows.push({
        brief: o.brief,
        rep: o.rep,
        runId: o.result.runId,
        hypothesisName: info.name,
        hypothesisId: id,
        verdict: info.verdict,
        findingsCount: info.findings,
        findingsBlurb: interesting ? findingsBlurbFor(runRoot, id) : undefined,
      });
    }
  }
  return rows;
}

function emoji(v: HypothesisRow['verdict']): string {
  if (v === 'hollow') return '🔴';
  if (v === 'minor') return '🟡';
  if (v === 'clean') return '✅';
  if (v === 'unknown') return '⚪';
  return '⛔';
}

function writeAggregateReport(
  outDir: string,
  outcomes: CellOutcome[],
  rows: HypothesisRow[],
): string {
  const lines: string[] = [];
  lines.push(`# Cycle 25 Phase A — 300-hypothesis validation\n`);
  lines.push(`_Generated: ${new Date().toISOString()}_\n`);
  lines.push(
    `_Briefs: ${BRIEFS.length}, reps: ${REPS_PER_BRIEF}, hypotheses/cell: ${HYPOTHESIS_COUNT}, concurrency: ${CONCURRENCY}._\n`,
  );

  lines.push(`## Cell summary (${outcomes.length} cells)\n`);
  lines.push(`| Brief | Rep | Run | Wall (s) | Status |`);
  lines.push(`|---|---|---|---|---|`);
  for (const o of outcomes) {
    const wall = o.wallSec.toFixed(0);
    const status = o.error
      ? `❌ ${o.error.slice(0, 80)}`
      : o.result?.fatalError
        ? `⚠️ ${o.result.fatalError.slice(0, 80)}`
        : '✅';
    lines.push(`| ${o.brief} | ${o.rep} | \`${o.result?.runId ?? '—'}\` | ${wall} | ${status} |`);
  }
  lines.push('');

  const counts: Record<HypothesisRow['verdict'], number> = {
    clean: 0,
    minor: 0,
    hollow: 0,
    unknown: 0,
    'no-verdict': 0,
  };
  for (const r of rows) counts[r.verdict]++;
  const total = rows.length;
  const hollowRate = total > 0 ? (counts.hollow / total) * 100 : 0;
  const cleanRate = total > 0 ? (counts.clean / total) * 100 : 0;
  lines.push(`## Aggregate (n=${total})\n`);
  lines.push(`| Verdict | Count | % |`);
  lines.push(`|---|---|---|`);
  for (const v of ['clean', 'minor', 'hollow', 'unknown', 'no-verdict'] as const) {
    const pct = total > 0 ? ((counts[v] / total) * 100).toFixed(1) : '0.0';
    lines.push(`| ${emoji(v)} ${v} | ${counts[v]} | ${pct}% |`);
  }
  lines.push('');
  lines.push(
    `**Clean rate: ${cleanRate.toFixed(1)}% — Hollow rate: ${hollowRate.toFixed(1)}%** (cycle 24 baseline against legacy briefs: hollow ~5% target).\n`,
  );

  lines.push(`## Per-brief breakdown\n`);
  lines.push(`| Brief | n | clean | minor | hollow | unknown | hollow % |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  const briefStats = new Map<
    string,
    { n: number; clean: number; minor: number; hollow: number; unknown: number }
  >();
  for (const r of rows) {
    const s = briefStats.get(r.brief) ?? { n: 0, clean: 0, minor: 0, hollow: 0, unknown: 0 };
    s.n++;
    if (r.verdict === 'clean') s.clean++;
    else if (r.verdict === 'minor') s.minor++;
    else if (r.verdict === 'hollow') s.hollow++;
    else if (r.verdict === 'unknown') s.unknown++;
    briefStats.set(r.brief, s);
  }
  // Stable order by configured briefs list
  for (const brief of BRIEFS) {
    const s = briefStats.get(brief);
    if (!s) continue;
    const pct = s.n > 0 ? ((s.hollow / s.n) * 100).toFixed(1) : '0.0';
    lines.push(
      `| ${brief} | ${s.n} | ${s.clean} | ${s.minor} | ${s.hollow} | ${s.unknown} | ${pct}% |`,
    );
  }
  lines.push('');

  const hollows = rows.filter((r) => r.verdict === 'hollow');
  if (hollows.length > 0) {
    lines.push(`## Hollow findings (require hand-walk)\n`);
    for (const r of hollows) {
      lines.push(`### ${r.brief}/r${r.rep}: ${r.hypothesisName}`);
      lines.push(
        `- Source: \`experiments/runs/${r.runId}/artifacts/${r.hypothesisId}/\``,
      );
      lines.push(`- Findings (${r.findingsCount ?? '?'}):`);
      if (r.findingsBlurb) lines.push(`      ${r.findingsBlurb}`);
      lines.push('');
    }
  }

  const minors = rows.filter((r) => r.verdict === 'minor');
  if (minors.length > 0) {
    lines.push(`## Minor findings (bet-preserving stubs surfaced)\n`);
    for (const r of minors) {
      lines.push(`### ${r.brief}/r${r.rep}: ${r.hypothesisName}`);
      lines.push(
        `- Source: \`experiments/runs/${r.runId}/artifacts/${r.hypothesisId}/\``,
      );
      if (r.findingsBlurb) lines.push(`      ${r.findingsBlurb}`);
      lines.push('');
    }
  }

  // Random clean sample for hand-walk
  const cleans = rows.filter((r) => r.verdict === 'clean');
  const shuffled = [...cleans].sort(() => Math.random() - 0.5).slice(0, 10);
  if (shuffled.length > 0) {
    lines.push(`## Clean sample for hand-walk (false-negative check)\n`);
    lines.push(
      `Pick a few of these and walk them in a browser; ensure the bet-critical loop closes end-to-end.\n`,
    );
    for (const r of shuffled) {
      lines.push(
        `- ${r.brief}/r${r.rep}: **${r.hypothesisName}** — \`experiments/runs/${r.runId}/preview.html\``,
      );
    }
    lines.push('');
  }

  const reportPath = join(outDir, 'aggregate.md');
  writeFileSync(reportPath, lines.join('\n'), 'utf8');
  return reportPath;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cells = buildCells();
  const outDir = join(RUNS_DIR, 'cycle25-aggregate');
  mkdirSync(outDir, { recursive: true });

   
  console.log(
    `Cycle 25 batch: ${BRIEFS.length} briefs × ${REPS_PER_BRIEF} reps × ${HYPOTHESIS_COUNT} hypotheses = ${cells.length} cells, ${cells.length * HYPOTHESIS_COUNT} hypotheses target. Concurrency=${CONCURRENCY}.`,
  );

  const startedAt = Date.now();
  const outcomes = await runWithConcurrency(
    cells,
    CONCURRENCY,
    (c, slot, idx, total) => {
       
      console.log(`[slot ${slot}] (${idx + 1}/${total}) starting ${c.brief}/r${c.rep}`);
    },
    (outcome, slot, idx, total) => {
      const status = outcome.error
        ? `ERROR: ${outcome.error.slice(0, 80)}`
        : outcome.result?.fatalError
          ? `WARN: ${outcome.result.fatalError.slice(0, 80)}`
          : `ok (${outcome.result?.runId})`;
       
      console.log(
        `[slot ${slot}] (${idx + 1}/${total}) done ${outcome.brief}/r${outcome.rep} in ${outcome.wallSec.toFixed(0)}s — ${status}`,
      );
    },
  );
  const totalWallSec = (Date.now() - startedAt) / 1000;

  const manifest = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    totalWallSec,
    concurrency: CONCURRENCY,
    briefs: BRIEFS,
    repsPerBrief: REPS_PER_BRIEF,
    hypothesesPerCell: HYPOTHESIS_COUNT,
    cells: outcomes.map((o) => ({
      brief: o.brief,
      rep: o.rep,
      runId: o.result?.runId,
      runRoot: o.result?.runRoot,
      wallSec: o.wallSec,
      error: o.error,
      fatalError: o.result?.fatalError,
    })),
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const rows = collectRows(outcomes);
  const reportPath = writeAggregateReport(outDir, outcomes, rows);

   
  console.log(`\nTotal wall: ${totalWallSec.toFixed(0)}s (${(totalWallSec / 60).toFixed(1)} min)`);
   
  console.log(`Report: ${reportPath}`);
   
  console.log(`Manifest: ${join(outDir, 'manifest.json')}`);
}

void DEFAULT_PER_RUN_TOKEN_CAP;

await main();
