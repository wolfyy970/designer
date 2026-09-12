#!/usr/bin/env tsx
/**
 * Cycle 24 Phase C — 50-prototype end-to-end validation.
 *
 * Runs 10 cells (5 briefs × 2 reps, each producing 5 hypotheses) with
 * concurrency limited to 4 in-flight. Uses `runOneCell` from matrix-runner
 * so deps load once per process (avoids the 10x tsx cold-start tax).
 *
 * On completion, aggregates every run's honesty verdicts into a single
 * report at `experiments/runs/cycle24-aggregate/aggregate.md`.
 *
 * Usage (on the studio):
 *   pnpm tsx experiments/scripts/cycle24-batch.ts
 *
 * The script writes a manifest of all spawned run-ids to
 * `experiments/runs/cycle24-aggregate/manifest.json` so a re-aggregator can
 * be run later if needed.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { runOneCell, type CellSpec, type RunOneCellResult } from './matrix-runner.ts';
import { DEFAULT_PER_RUN_TOKEN_CAP } from '../src/cost.ts';
import taskDefaults from '../../config/task-defaults.json';

const REPO_ROOT = process.cwd();
const BRIEFS_DIR = join(REPO_ROOT, 'experiments', 'briefs');
const RUNS_DIR = join(REPO_ROOT, 'experiments', 'runs');

const DEFAULT_BRIEFS = [
  'password-reset',
  'habit-tracker',
  'grief-app',
  'code-onboarding',
  'icu-handoff',
] as const;
const REPS_PER_BRIEF = 2;
const CONCURRENCY = 4;

/**
 * Resolve briefs from CLI: `--briefs a,b,c` overrides the default 5-brief set.
 * Useful for re-firing a subset (e.g. Phase D re-runs only password-reset,
 * habit-tracker, grief-app to validate the new retry profile).
 */
function resolveBriefs(): readonly string[] {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--briefs');
  if (i === -1 || !argv[i + 1]) return DEFAULT_BRIEFS;
  const list = argv[i + 1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (list.length === 0) return DEFAULT_BRIEFS;
  return list;
}
const BRIEFS = resolveBriefs();
const PER_RUN_CAP_TOKENS = 1_000_000;
const DAILY_CAP_TOKENS = 20_000_000; // headroom for the batch
const HYPOTHESIS_COUNT = 5;

// ── Cell definition ───────────────────────────────────────────────────────

interface Cell {
  brief: string;
  rep: number;
  spec: CellSpec;
}

function buildCells(): Cell[] {
  const cells: Cell[] = [];
  for (const brief of BRIEFS) {
    const briefPath = join(BRIEFS_DIR, `${brief}.md`);
    if (!existsSync(briefPath)) {
      throw new Error(`Brief not found: ${briefPath}`);
    }
    for (let rep = 1; rep <= REPS_PER_BRIEF; rep++) {
      cells.push({
        brief,
        rep,
        spec: {
          flow: 'ideation',
          briefPath,
          count: HYPOTHESIS_COUNT,
          evaluate: false,
          build: true,
          perRunCapTokens: PER_RUN_CAP_TOKENS,
          dailyCapTokens: DAILY_CAP_TOKENS,
          providerId: 'openrouter',
          modelId: taskDefaults.perTaskDefaults.design.modelId,
        },
      });
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
  onCellStart: (c: Cell, slot: number) => void,
  onCellEnd: (outcome: CellOutcome, slot: number) => void,
): Promise<CellOutcome[]> {
  const outcomes: CellOutcome[] = new Array(cells.length);
  let nextIndex = 0;

  async function worker(slot: number): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= cells.length) return;
      const cell = cells[i];
      onCellStart(cell, slot);
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
      onCellEnd(outcomes[i], slot);
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
  /** Concatenated short findings (file:line + comment) for verdicts of interest. */
  findingsBlurb?: string;
  errorNote?: string;
}

function parseHonestyRowsFromSummary(summaryPath: string): Map<string, { name: string; verdict: HypothesisRow['verdict']; findings: number | null }> {
  const out = new Map<string, { name: string; verdict: HypothesisRow['verdict']; findings: number | null }>();
  if (!existsSync(summaryPath)) return out;
  const summary = readFileSync(summaryPath, 'utf8');
  // Each hypothesis is `### [Name](artifacts/<id>/index.html)`; followed by a `- **honesty**: ...` line.
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

/** Pull each finding's file/comment from the honesty transcript (NN-honesty-<slug>.md). */
function findingsBlurbFor(runRoot: string, hypothesisId: string): string | undefined {
  const transcripts = join(runRoot, 'transcripts');
  if (!existsSync(transcripts)) return undefined;
  let chosen: string | null = null;
  try {
    const files = readdirSync(transcripts).filter((f) => /honesty-.*\.md$/i.test(f));
    // Find the transcript matching this hypothesis: it embeds the short id slug at the end
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
  // Extract Response code block and pull findings out of the JSON.
  const respMatch = raw.match(/## Response\s*```text\s*([\s\S]*?)```/);
  if (!respMatch) return undefined;
  try {
    const verdict = JSON.parse(respMatch[1]) as { findings?: Array<{ file?: string; line?: number; comment?: string; severity?: string }> };
    if (!verdict.findings || verdict.findings.length === 0) return undefined;
    return verdict.findings
      .map((f) => `\`${f.severity ?? '?'}\` ${f.file ?? ''}:${f.line ?? '?'} — ${(f.comment ?? '').slice(0, 160)}`)
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

function writeAggregateReport(outDir: string, outcomes: CellOutcome[], rows: HypothesisRow[]): string {
  const lines: string[] = [];
  lines.push(`# Cycle 24 Phase C — 50-prototype validation\n`);
  lines.push(`_Generated: ${new Date().toISOString()}_\n`);

  // Cell-level summary
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

  // Aggregate counts
  const counts: Record<HypothesisRow['verdict'], number> = { clean: 0, minor: 0, hollow: 0, unknown: 0, 'no-verdict': 0 };
  for (const r of rows) counts[r.verdict]++;
  const total = rows.length;
  const hollowRate = total > 0 ? (counts.hollow / total) * 100 : 0;
  lines.push(`## Aggregate (n=${total})\n`);
  lines.push(`| Verdict | Count | % |`);
  lines.push(`|---|---|---|`);
  for (const v of ['clean', 'minor', 'hollow', 'unknown', 'no-verdict'] as const) {
    const pct = total > 0 ? ((counts[v] / total) * 100).toFixed(1) : '0.0';
    lines.push(`| ${emoji(v)} ${v} | ${counts[v]} | ${pct}% |`);
  }
  lines.push('');
  lines.push(`**Hollow rate: ${hollowRate.toFixed(1)}%** (cycle 24 success target: ≤5%; escalation threshold: >10%).\n`);

  // Per-brief breakdown
  lines.push(`## Per-brief breakdown\n`);
  lines.push(`| Brief | n | clean | minor | hollow | unknown | hollow % |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  const briefStats = new Map<string, { n: number; clean: number; minor: number; hollow: number; unknown: number }>();
  for (const r of rows) {
    const s = briefStats.get(r.brief) ?? { n: 0, clean: 0, minor: 0, hollow: 0, unknown: 0 };
    s.n++;
    if (r.verdict === 'clean') s.clean++;
    else if (r.verdict === 'minor') s.minor++;
    else if (r.verdict === 'hollow') s.hollow++;
    else if (r.verdict === 'unknown') s.unknown++;
    briefStats.set(r.brief, s);
  }
  for (const [brief, s] of briefStats.entries()) {
    const pct = s.n > 0 ? ((s.hollow / s.n) * 100).toFixed(1) : '0.0';
    lines.push(`| ${brief} | ${s.n} | ${s.clean} | ${s.minor} | ${s.hollow} | ${s.unknown} | ${pct}% |`);
  }
  lines.push('');

  // Hollow detail
  const hollows = rows.filter((r) => r.verdict === 'hollow');
  if (hollows.length > 0) {
    lines.push(`## Hollow findings (require hand-walk)\n`);
    for (const r of hollows) {
      lines.push(`### ${r.brief}/r${r.rep}: ${r.hypothesisName}`);
      lines.push(`- Source: \`experiments/runs/${r.runId}/artifacts/${r.hypothesisId}/\``);
      lines.push(`- Findings (${r.findingsCount ?? '?'}):`);
      if (r.findingsBlurb) lines.push(`      ${r.findingsBlurb}`);
      lines.push('');
    }
  }

  // Minor detail
  const minors = rows.filter((r) => r.verdict === 'minor');
  if (minors.length > 0) {
    lines.push(`## Minor findings (bet-preserving stubs surfaced)\n`);
    for (const r of minors) {
      lines.push(`### ${r.brief}/r${r.rep}: ${r.hypothesisName}`);
      lines.push(`- Source: \`experiments/runs/${r.runId}/artifacts/${r.hypothesisId}/\``);
      if (r.findingsBlurb) lines.push(`      ${r.findingsBlurb}`);
      lines.push('');
    }
  }

  // Pick 5 random clean for hand-walk
  const cleans = rows.filter((r) => r.verdict === 'clean');
  const shuffled = [...cleans].sort(() => Math.random() - 0.5).slice(0, 5);
  if (shuffled.length > 0) {
    lines.push(`## Clean sample for hand-walk (false-negative check)\n`);
    lines.push(`Pick a few of these and walk them in a browser; ensure the bet-critical loop closes end-to-end.\n`);
    for (const r of shuffled) {
      lines.push(`- ${r.brief}/r${r.rep}: **${r.hypothesisName}** — \`experiments/runs/${r.runId}/preview.html\``);
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
  const outDir = join(RUNS_DIR, 'cycle24-aggregate');
  mkdirSync(outDir, { recursive: true });

   
  console.log(`Cycle 24 batch: ${cells.length} cells, concurrency=${CONCURRENCY}`);
   
  console.log(`Cells: ${cells.map((c) => `${c.brief}/r${c.rep}`).join(', ')}`);

  const startedAt = Date.now();
  const outcomes = await runWithConcurrency(
    cells,
    CONCURRENCY,
    (c, slot) => {

      console.log(`[slot ${slot}] starting ${c.brief}/r${c.rep}`);
    },
    (outcome, slot) => {
      const status = outcome.error
        ? `ERROR: ${outcome.error.slice(0, 80)}`
        : outcome.result?.fatalError
          ? `WARN: ${outcome.result.fatalError.slice(0, 80)}`
          : `ok (${outcome.result?.runId})`;

      console.log(`[slot ${slot}] done ${outcome.brief}/r${outcome.rep} in ${outcome.wallSec.toFixed(0)}s — ${status}`);
    },
  );
  const totalWallSec = (Date.now() - startedAt) / 1000;

  // Manifest
  const manifest = {
    startedAt: new Date(startedAt).toISOString(),
    totalWallSec,
    concurrency: CONCURRENCY,
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

// Avoid unused-import warning on DEFAULT_PER_RUN_TOKEN_CAP if we drop it later.
void DEFAULT_PER_RUN_TOKEN_CAP;

await main();
