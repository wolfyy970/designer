#!/usr/bin/env tsx
/**
 * Cycle 23 re-audit — replay the current honesty-check auditor against a
 * stratified sample of historical builds.
 *
 * The question this script answers: how much of the historical "hollow rate"
 * (cycle 21 password-reset 40% hollow, cycle 22 habit-tracker 40-50% hollow)
 * was a real failure mode in the builds, versus the auditor being over-strict
 * before the cycle 23 "bet-preserving vs bet-killing" rule refinement?
 *
 * Method:
 * - Hand-picked 4 source runs spanning 4 briefs (password-reset, habit-tracker,
 *   grief-app, code-onboarding) with a mix of historical verdicts.
 * - For each hypothesis in the sample, load the original artifact files from
 *   disk, parse the hypothesis JSON, and re-fire `runHonestyCheck` using the
 *   current (cycle 23) auditor prompt.
 * - Compare the new verdict against the original verdict (where one exists in
 *   the source run's summary.md) and classify the delta: re-classified
 *   (old-hollow → new-clean/minor, signal of rule getting more reasonable),
 *   confirmed-hollow (old-hollow → still-hollow, signal of genuine build
 *   miss), false-negative (old-clean → new-hollow, signal that the new rule
 *   is under-rejecting), or no-change.
 * - Write a markdown report comparing the verdicts and classifying each
 *   delta.
 *
 * Usage:
 *   pnpm tsx experiments/scripts/re-audit-cycle23.ts
 *
 * Output:
 *   experiments/runs/<re-audit-run-id>/
 *     transcripts/        — one per re-audit honesty-check call
 *     re-audit-report.md  — comparison table + classification breakdown
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { createRunDir } from '../src/runDir.ts';
import taskDefaults from '../../config/task-defaults.json';
import {
  CostTracker,
  DEFAULT_DAILY_TOKEN_CAP,
  ledgerPathDefault,
} from '../src/cost.ts';
import {
  createStageContext,
  runHonestyCheck,
  type HonestyVerdict,
} from '../src/flow.ts';
import type { HypothesisStrategy } from '../../src/types/incubator.ts';

const PROVIDER = 'openrouter';
/** Model the app pins by default, read from config so this cannot drift. */
const MODEL = taskDefaults.perTaskDefaults.design.modelId;

// ── Sample definition ─────────────────────────────────────────────────────

interface SampleEntry {
  /** Source run dir id under experiments/runs/. */
  runId: string;
  /** Brief id (for the report). */
  brief: string;
  /** Cycle/era this run came from (for the report). */
  era: string;
  /**
   * Which hypotheses to audit. `'all'` audits every hypothesis in
   * `hypotheses.json`; a list of names (substring match) audits a subset.
   * Hypotheses without an artifact dir are skipped automatically.
   */
  hypotheses: 'all' | string[];
}

const SAMPLE: SampleEntry[] = [
  {
    runId: '20260511-153102-ideation-0fee',
    brief: 'password-reset',
    era: 'cycle 21 (pre-cycle-22 builds, cycle-20 auditor verdicts)',
    hypotheses: 'all', // 5 hyp: 2 hollow + 3 clean per old auditor
  },
  {
    runId: '20260511-162632-ideation-9a40',
    brief: 'habit-tracker',
    era: 'cycle 22 (cycle-22 builds, cycle-22 auditor verdicts)',
    hypotheses: 'all', // 5 hyp, 1 had stage timeout (no artifact); 2 hollow + 2 clean
  },
  {
    runId: '20260510-152438-ideation-8a31',
    brief: 'grief-app',
    era: 'cycle 18 (pre-cycle-20 builds, no honesty verdicts on file)',
    hypotheses: 'all', // 5 hyp; cycle 18 narrative reports 0 hand-waving across the 20 builds in that batch
  },
  {
    runId: '20260510-160628-ideation-2b73',
    brief: 'code-onboarding',
    era: 'cycle 19 (pre-cycle-21 builds, no honesty verdicts on file)',
    hypotheses: 'all', // 5 hyp; cross-cutting brief; cycle 19 narrative reports permission-gated hand-waving
  },
];

// ── Loading helpers ───────────────────────────────────────────────────────

function repoRoot(): string {
  return process.cwd();
}

function sourceRunPath(runId: string): string {
  return join(repoRoot(), 'experiments', 'runs', runId);
}

interface SourceHypothesis {
  id: string;
  name: string;
  hypothesis: HypothesisStrategy;
  artifactDir: string;
  files: Record<string, string>;
  /** Verdict word extracted from source run's summary.md, if any. */
  oldVerdict: 'clean' | 'minor' | 'hollow' | 'unknown' | null;
  /** Original honesty findings count, if present in summary. */
  oldFindings: number | null;
}

/** Recursively read every text file under `dir` into a flat map of relative paths. */
function readArtifactFiles(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  function walk(current: string): void {
    const entries = readdirSync(current);
    for (const entry of entries) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        // Skip large binary-y stuff just in case
        if (stat.size > 200_000) continue;
        const rel = relative(dir, full).replaceAll('\\', '/');
        try {
          out[rel] = readFileSync(full, 'utf8');
        } catch {
          /* skip unreadable */
        }
      }
    }
  }
  walk(dir);
  return out;
}

/**
 * Parse the source run's summary.md to find each hypothesis's recorded verdict.
 * Returns a map of hypothesisId → { verdict, findingsCount } for hypotheses
 * that had a honesty row in the summary; missing entries mean no honesty
 * verdict was on file (i.e. pre-cycle-20 run).
 */
function parseOldVerdicts(
  summaryPath: string,
): Map<string, { verdict: SourceHypothesis['oldVerdict']; findings: number | null }> {
  const out = new Map<string, { verdict: SourceHypothesis['oldVerdict']; findings: number | null }>();
  let summary = '';
  try {
    summary = readFileSync(summaryPath, 'utf8');
  } catch {
    return out;
  }
  // Hypothesis sections look like: `### [Name](artifacts/<uuid>/index.html)`
  // followed (eventually) by a line `- **honesty**: ✅ clean (3 findings)`.
  const sectionRe = /^### \[([^\]]+)\]\(artifacts\/([^/)]+)\/[^)]*\)$/gm;
  let m: RegExpExecArray | null;
  const ranges: { id: string; start: number; end: number }[] = [];
  while ((m = sectionRe.exec(summary))) {
    ranges.push({ id: m[2], start: m.index, end: -1 });
  }
  for (let i = 0; i < ranges.length; i++) {
    ranges[i].end = i + 1 < ranges.length ? ranges[i + 1].start : summary.length;
    const block = summary.slice(ranges[i].start, ranges[i].end);
    const honestyMatch = block.match(/-\s*\*\*honesty\*\*:\s*([^\n]+)/);
    if (honestyMatch) {
      const line = honestyMatch[1];
      let verdict: SourceHypothesis['oldVerdict'] = null;
      if (/🔴\s*hollow/.test(line) || /\bhollow\b/i.test(line)) verdict = 'hollow';
      else if (/🟡\s*minor/.test(line) || /\bminor\b/i.test(line)) verdict = 'minor';
      else if (/✅\s*clean/.test(line) || /\bclean\b/i.test(line)) verdict = 'clean';
      else if (/⚪/.test(line) || /\bunknown\b/i.test(line)) verdict = 'unknown';
      const findingsMatch = line.match(/\((\d+)\s+find/);
      const findings = findingsMatch ? parseInt(findingsMatch[1], 10) : null;
      out.set(ranges[i].id, { verdict, findings });
    }
  }
  return out;
}

function loadSampleEntry(entry: SampleEntry): SourceHypothesis[] {
  const runPath = sourceRunPath(entry.runId);
  const hypothesesPath = join(runPath, 'hypotheses.json');
  let plan: { hypotheses: HypothesisStrategy[] };
  try {
    const raw = readFileSync(hypothesesPath, 'utf8');
    plan = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Could not load hypotheses.json from ${runPath}: ${(err as Error).message}`);
  }
  const oldVerdicts = parseOldVerdicts(join(runPath, 'summary.md'));

  const hyps = plan.hypotheses ?? [];
  const filtered = entry.hypotheses === 'all'
    ? hyps
    : hyps.filter((h) => entry.hypotheses !== 'all' && entry.hypotheses.some((needle) => h.name.toLowerCase().includes(needle.toLowerCase())));

  const out: SourceHypothesis[] = [];
  for (const hyp of filtered) {
    const artifactDir = join(runPath, 'artifacts', hyp.id);
    let files: Record<string, string>;
    try {
      files = readArtifactFiles(artifactDir);
    } catch {
      // No artifacts (e.g. stage timeout) — skip
      continue;
    }
    if (Object.keys(files).length === 0) continue;
    const v = oldVerdicts.get(hyp.id);
    out.push({
      id: hyp.id,
      name: hyp.name,
      hypothesis: hyp,
      artifactDir,
      files,
      oldVerdict: v?.verdict ?? null,
      oldFindings: v?.findings ?? null,
    });
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────

function classify(oldV: SourceHypothesis['oldVerdict'], newV: HonestyVerdict['verdict']): string {
  if (oldV === null) {
    // Forward audit only
    return `forward-${newV}`;
  }
  if (oldV === 'hollow' && (newV === 'clean' || newV === 'minor')) return 're-classified (rule changed)';
  if (oldV === 'hollow' && newV === 'hollow') return 'confirmed-hollow (real build miss)';
  if ((oldV === 'clean' || oldV === 'minor') && newV === 'hollow') return 'false-negative-caught (new rule stricter)';
  if (oldV === newV) return 'confirmed-no-change';
  return `delta-${oldV}-to-${newV}`;
}

function emoji(v: HonestyVerdict['verdict'] | SourceHypothesis['oldVerdict']): string {
  if (v === 'hollow') return '🔴';
  if (v === 'minor') return '🟡';
  if (v === 'clean') return '✅';
  if (v === 'unknown') return '⚪';
  return '—';
}

async function main(): Promise<void> {
  const runDir = createRunDir({ flowName: 're-audit', briefId: 'cycle-23-validation', dryRun: false });
  const cost = new CostTracker(DEFAULT_DAILY_TOKEN_CAP * 4, runDir.id, 're-audit', ledgerPathDefault());
  const ctx = createStageContext({
    runDir,
    providerId: PROVIDER,
    modelId: MODEL,
    cost,
    dryRun: false,
  });

   
  console.log(`Re-audit run: ${runDir.id}`);
   
  console.log(`Report: ${join(runDir.root, 're-audit-report.md')}\n`);

  interface ReportRow {
    brief: string;
    era: string;
    hypothesisName: string;
    hypothesisId: string;
    oldVerdict: SourceHypothesis['oldVerdict'];
    oldFindings: number | null;
    newVerdict: HonestyVerdict['verdict'];
    newFindings: number;
    classification: string;
    keyFinding?: string;
  }

  const rows: ReportRow[] = [];

  for (const entry of SAMPLE) {
     
    console.log(`\n=== ${entry.brief} (${entry.era}) — run ${entry.runId} ===`);
    let samples: SourceHypothesis[];
    try {
      samples = loadSampleEntry(entry);
    } catch (err) {
       
      console.error(`  Failed to load: ${(err as Error).message}`);
      continue;
    }
     
    console.log(`  ${samples.length} hypotheses with artifacts\n`);

    for (const sample of samples) {
      const oldLabel = sample.oldVerdict
        ? `${emoji(sample.oldVerdict)} ${sample.oldVerdict}${sample.oldFindings != null ? ` (${sample.oldFindings} findings)` : ''}`
        : '— (no prior verdict on file)';
       
      console.log(`  ▶ ${sample.name}\n      old: ${oldLabel}`);

      try {
        const { verdict } = await runHonestyCheck(ctx, { hypothesis: sample.hypothesis, files: sample.files });
        const newLabel = `${emoji(verdict.verdict)} ${verdict.verdict} (${verdict.findings.length} findings)`;
        const classification = classify(sample.oldVerdict, verdict.verdict);
        const keyFinding =
          verdict.findings.find((f) => f.severity === 'hollow')?.explanation ??
          verdict.findings.find((f) => f.severity === 'minor')?.explanation;
         
        console.log(`      new: ${newLabel}   → ${classification}`);
        rows.push({
          brief: entry.brief,
          era: entry.era,
          hypothesisName: sample.name,
          hypothesisId: sample.id,
          oldVerdict: sample.oldVerdict,
          oldFindings: sample.oldFindings,
          newVerdict: verdict.verdict,
          newFindings: verdict.findings.length,
          classification,
          keyFinding,
        });
      } catch (err) {
         
        console.error(`      ERROR: ${(err as Error).message}`);
        rows.push({
          brief: entry.brief,
          era: entry.era,
          hypothesisName: sample.name,
          hypothesisId: sample.id,
          oldVerdict: sample.oldVerdict,
          oldFindings: sample.oldFindings,
          newVerdict: 'unknown',
          newFindings: 0,
          classification: `error: ${(err as Error).message}`,
        });
      }
    }
  }

  // ── Report ────────────────────────────────────────────────────────────
  const report: string[] = [];
  report.push(`# Cycle 23 honesty-check re-audit\n`);
  report.push(`_Run id: \`${runDir.id}\` · provider: \`${PROVIDER}\` · model: \`${MODEL}\`_\n`);
  report.push(`Replays the current (cycle 23) honesty-check auditor against historical builds across four source runs.\n`);

  report.push(`## Per-hypothesis comparison\n`);
  report.push(`| Brief | Hypothesis | Old | New | Classification |`);
  report.push(`|---|---|---|---|---|`);
  for (const r of rows) {
    const oldLabel = r.oldVerdict
      ? `${emoji(r.oldVerdict)} ${r.oldVerdict}${r.oldFindings != null ? ` (${r.oldFindings})` : ''}`
      : '—';
    const newLabel = `${emoji(r.newVerdict)} ${r.newVerdict} (${r.newFindings})`;
    report.push(`| ${r.brief} | ${r.hypothesisName} | ${oldLabel} | ${newLabel} | ${r.classification} |`);
  }
  report.push('');

  // Classification breakdown
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.classification, (counts.get(r.classification) ?? 0) + 1);
  report.push(`## Classification breakdown\n`);
  for (const [cls, n] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1])) {
    report.push(`- **${cls}**: ${n}`);
  }
  report.push('');

  // Highlight rows with hollow new verdict for inspection
  const newlyHollow = rows.filter((r) => r.newVerdict === 'hollow');
  if (newlyHollow.length > 0) {
    report.push(`## Hypotheses with new verdict = hollow\n`);
    for (const r of newlyHollow) {
      report.push(`### ${r.brief}: ${r.hypothesisName}`);
      report.push(`- Source: \`experiments/runs/${SAMPLE.find((s) => s.brief === r.brief)?.runId}/artifacts/${r.hypothesisId}/\``);
      report.push(`- Old: ${r.oldVerdict ?? '— (no prior verdict)'}, New: hollow (${r.newFindings} findings)`);
      if (r.keyFinding) report.push(`- Key finding: ${r.keyFinding}`);
      report.push('');
    }
  }

  // Key bet-preserving minor findings for transparency
  const newMinor = rows.filter((r) => r.newVerdict === 'minor');
  if (newMinor.length > 0) {
    report.push(`## Hypotheses with new verdict = minor (bet-preserving stubs surfaced)\n`);
    for (const r of newMinor) {
      report.push(`- **${r.brief} / ${r.hypothesisName}** — old: ${r.oldVerdict ?? '—'}; ${r.keyFinding ?? '(no key finding extracted)'}`);
    }
    report.push('');
  }

  const reportPath = join(runDir.root, 're-audit-report.md');
  writeFileSync(reportPath, report.join('\n'), 'utf8');
   
  console.log(`\nReport written: ${reportPath}`);
}

await main();
