#!/usr/bin/env tsx
/**
 * Cycle 26 — product-shape gate smoke test.
 *
 *   5 briefs × 1 rep × 5 hypotheses = 25 hypotheses, 5 cells.
 *
 * Tests the curation + hypothesis-stage gates added in cycle 26 that
 * require hypotheses to be (a) digital products (remove-the-software
 * test fails) and (b) fit to the brief's declared `Target surfaces`.
 *
 * Briefs chosen from the **successful half** of cycle 25 (the half
 * the system worked on, so we're testing the gate not the cliff):
 *
 *   - remote-onboarding-week-one (the brief that exposed the gap)
 *   - pre-travel-prescription (had mix of products + service-shaped)
 *   - deceased-accounts (had real product seeds)
 *   - housing-court-defense (had 15/15 honesty-clean — does gate change which appear?)
 *   - primary-care-search (had market-existing variants — gate push toward novelty?)
 *
 * Concurrency=3 (small footprint to avoid quota issues from cycle 25).
 *
 * Output: experiments/runs/cycle26-aggregate/{manifest.json, batch.log, hypotheses-flat.json}
 * The hypotheses-flat.json file lists every hypothesis across all cells with brief, rep,
 * name, hypothesis prose, rationale — for hand-scoring against the remove-the-software test.
 *
 * Usage on the studio:
 *   pnpm tsx experiments/scripts/cycle26-batch.ts
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { runOneCell, type CellSpec, type RunOneCellResult } from './matrix-runner.ts';
import { DEFAULT_PER_RUN_TOKEN_CAP } from '../src/cost.ts';
import taskDefaults from '../../config/task-defaults.json';

const REPO_ROOT = process.cwd();
const BRIEFS_DIR = join(REPO_ROOT, 'experiments', 'briefs');
const RUNS_DIR = join(REPO_ROOT, 'experiments', 'runs');

const BRIEFS = [
  'remote-onboarding-week-one',
  'pre-travel-prescription',
  'deceased-accounts',
  'housing-court-defense',
  'primary-care-search',
] as const;

const REPS_PER_BRIEF = 1;
const CONCURRENCY = 3;
const HYPOTHESIS_COUNT = 5;

const PER_RUN_CAP_TOKENS = 1_500_000;
const DAILY_CAP_TOKENS = 50_000_000;

// ── Cell definition ───────────────────────────────────────────────────────

interface Cell {
  brief: string;
  rep: number;
  spec: CellSpec;
}

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

// ── Hypothesis aggregator for hand-scoring ───────────────────────────────

interface FlatHypothesis {
  brief: string;
  rep: number;
  runId: string;
  runRoot: string;
  hypothesisId: string;
  hypothesisName: string;
  hypothesisProse: string;
  rationale: string;
  measurements: string;
  honestyVerdict?: string;
  /** Hand-score field — left blank for scoring after the run. */
  removeTheSoftwareTest?: 'pass' | 'fail-service' | 'fail-meeting' | 'fail-config' | 'fail-clone' | '';
  /** Hand-score field — left blank for scoring after the run. */
  surfaceFit?: 'pass' | 'fail' | 'n/a' | '';
  /** Hand-score field — free-form note from the human reviewer. */
  scoringNote?: string;
}

function flattenHypotheses(outcomes: CellOutcome[]): FlatHypothesis[] {
  const flat: FlatHypothesis[] = [];
  for (const o of outcomes) {
    if (o.error || !o.result) continue;
    const hypPath = join(o.result.runRoot, 'hypotheses.json');
    if (!existsSync(hypPath)) continue;
    let parsed: { hypotheses?: Array<{ id?: string; name?: string; hypothesis?: string; rationale?: string; measurements?: string }> };
    try {
      parsed = JSON.parse(readFileSync(hypPath, 'utf8'));
    } catch {
      continue;
    }
    if (!parsed.hypotheses) continue;
    for (const h of parsed.hypotheses) {
      flat.push({
        brief: o.brief,
        rep: o.rep,
        runId: o.result.runId,
        runRoot: o.result.runRoot,
        hypothesisId: h.id ?? '',
        hypothesisName: h.name ?? '',
        hypothesisProse: h.hypothesis ?? '',
        rationale: h.rationale ?? '',
        measurements: h.measurements ?? '',
        removeTheSoftwareTest: '',
        surfaceFit: '',
        scoringNote: '',
      });
    }
  }
  return flat;
}

// ── Curation-rationale extractor (audit trail for the gate) ──────────────

interface CurationRationale {
  brief: string;
  rep: number;
  runId: string;
  /** Text content of transcripts/02-curation.md, or null if not found. */
  transcriptText: string | null;
}

function collectCurationRationales(outcomes: CellOutcome[]): CurationRationale[] {
  const out: CurationRationale[] = [];
  for (const o of outcomes) {
    if (o.error || !o.result) continue;
    // The curation transcript is the second stage; its filename includes
    // the stage slug. We search the transcripts directory for files
    // matching *curation*.md.
    const transcriptsDir = join(o.result.runRoot, 'transcripts');
    if (!existsSync(transcriptsDir)) {
      out.push({ brief: o.brief, rep: o.rep, runId: o.result.runId, transcriptText: null });
      continue;
    }
    let transcriptText: string | null = null;
    try {
      const files = readdirSync(transcriptsDir).filter((f) => /curation/i.test(f));
      const chosen = files[0];
      if (chosen) {
        transcriptText = readFileSync(join(transcriptsDir, chosen), 'utf8');
      }
    } catch {
      transcriptText = null;
    }
    out.push({ brief: o.brief, rep: o.rep, runId: o.result.runId, transcriptText });
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cells = buildCells();
  const outDir = join(RUNS_DIR, 'cycle26-aggregate');
  mkdirSync(outDir, { recursive: true });

   
  console.log(
    `Cycle 26 batch: ${BRIEFS.length} briefs × ${REPS_PER_BRIEF} reps × ${HYPOTHESIS_COUNT} hypotheses = ${cells.length} cells, ${cells.length * HYPOTHESIS_COUNT} hypotheses target. Concurrency=${CONCURRENCY}.`,
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
    cycle: 26,
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

  // Flat hypothesis dump for hand-scoring
  const flat = flattenHypotheses(outcomes);
  writeFileSync(join(outDir, 'hypotheses-flat.json'), JSON.stringify(flat, null, 2), 'utf8');

  // Curation transcripts for audit-trail review (proves the gate fired)
  const rationales = collectCurationRationales(outcomes);
  writeFileSync(
    join(outDir, 'curation-transcripts.json'),
    JSON.stringify(rationales, null, 2),
    'utf8',
  );

   
  console.log(`\nTotal wall: ${totalWallSec.toFixed(0)}s (${(totalWallSec / 60).toFixed(1)} min)`);
   
  console.log(`Manifest: ${join(outDir, 'manifest.json')}`);
   
  console.log(`Flat hypotheses (for hand-scoring): ${join(outDir, 'hypotheses-flat.json')}`);
   
  console.log(`Curation transcripts (audit trail): ${join(outDir, 'curation-transcripts.json')}`);
}

void DEFAULT_PER_RUN_TOKEN_CAP;

await main();
