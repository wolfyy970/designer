#!/usr/bin/env tsx
/**
 * Anti-repetition experiment — does the production `existingStrategies`
 * feedback block actually produce more distinct hypothesis cards than
 * asking the incubator for the same total count in one shot?
 *
 * Three arms, all producing 10 hypotheses per cell:
 *
 *   Arm A:  one incubator call asking for 10 hypotheses.
 *   Arm B:  two incubator calls of 5 each, the SECOND call given the
 *           first 5 via the production `existingStrategies` mechanism
 *           (anti-repetition block). This is what the canvas does when
 *           the user clicks "Regenerate" on the IncubatorNode.
 *   Arm C:  two incubator calls of 5 each, with NO anti-repetition
 *           context between them. Null control — isolates the effect
 *           of the anti-repetition block vs just-splitting-the-call.
 *
 * Each arm × brief × rep is a "cell." We hold the spec constant per
 * brief (frozen once, reused across all cells) so that inputs-gen noise
 * doesn't confound the incubator-behavior measurement.
 *
 * Matrix: 3 arms × 4 briefs × 5 reps = 60 cells, ~100 LLM calls total.
 *
 * Usage:
 *   pnpm tsx experiments/scripts/anti-repetition-experiment.ts \
 *     [--concurrency 8] \
 *     [--reps 5]
 *
 * Output:
 *   experiments/matrix/<timestamp>-anti-repetition/
 *     specs/<brief-id>.json       frozen spec per brief (reused across cells)
 *     manifest.json                cell list
 *     status.json                  live progress
 *     results.jsonl                one row per cell with all hypotheses
 *     log.txt                      orchestrator log
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import taskDefaults from '../../config/task-defaults.json';

import {
  CostTracker,
  DEFAULT_PER_RUN_TOKEN_CAP,
  ledgerPathDefault,
} from '../src/cost.ts';
import { createRunDir } from '../src/runDir.ts';
import {
  createStageContext,
  runInputsGen,
  runIncubator,
} from '../src/flow.ts';
import { assembleSpec } from '../src/flows/canonical.ts';
import type { DesignSpec } from '../../src/types/spec.ts';
import type { HypothesisStrategy } from '../../src/types/incubator.ts';

const DEFAULT_PROVIDER = 'openrouter';
/** Model the app pins by default, read from config so this cannot drift. */
const DEFAULT_MODEL = taskDefaults.perTaskDefaults.design.modelId;

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const BRIEFS_DIR = join(REPO_ROOT, 'experiments/briefs');
const MATRIX_ROOT = join(REPO_ROOT, 'experiments/matrix');

// ── Briefs (same four as the main matrix) ──────────────────────────────────

interface BriefSpec {
  id: string;
  briefFile: string;
  /** If present, R/O/C are pre-written and we skip inputs-gen on the freeze step. */
  supplied?: { research?: string; objectives?: string; constraints?: string };
}

const BRIEFS: BriefSpec[] = [
  {
    id: 'grief-app',
    briefFile: 'grief-app.md',
    supplied: {
      research: 'grief-app-research.md',
      objectives: 'grief-app-objectives.md',
      constraints: 'grief-app-constraints.md',
    },
  },
  { id: 'code-onboarding', briefFile: 'code-onboarding.md' },
  { id: 'habit-tracker', briefFile: 'habit-tracker.md' },
  { id: 'icu-handoff', briefFile: 'icu-handoff.md' },
];

// ── Spec freezing ──────────────────────────────────────────────────────────

/**
 * Build a frozen `DesignSpec` for a brief. If supplied R/O/C files exist
 * we use them directly; otherwise we run inputs-gen ONCE and save the
 * generated sections to disk so the spec is reproducible. The frozen
 * spec is then reused across all 15 cells (3 arms × 5 reps) for that
 * brief, so the variable under test is purely incubator behavior.
 */
async function ensureFrozenSpec(
  brief: BriefSpec,
  specDir: string,
  ctx: ReturnType<typeof createStageContext>,
  briefContent: string,
): Promise<DesignSpec> {
  const specPath = join(specDir, `${brief.id}.json`);
  if (existsSync(specPath)) {
    return JSON.parse(readFileSync(specPath, 'utf8')) as DesignSpec;
  }

  let research = '';
  let objectives = '';
  let constraints = '';

  if (brief.supplied?.research) {
    research = readFileSync(join(BRIEFS_DIR, brief.supplied.research), 'utf8');
  }
  if (brief.supplied?.objectives) {
    objectives = readFileSync(join(BRIEFS_DIR, brief.supplied.objectives), 'utf8');
  }
  if (brief.supplied?.constraints) {
    constraints = readFileSync(join(BRIEFS_DIR, brief.supplied.constraints), 'utf8');
  }

  // Generate any missing sections via inputs-gen — one call per section,
  // each call sees the (possibly-empty) prior sections as context.
  const order: Array<'research-context' | 'objectives-metrics' | 'design-constraints'> = [
    'research-context',
    'objectives-metrics',
    'design-constraints',
  ];
  for (const target of order) {
    const filled =
      (target === 'research-context' && research) ||
      (target === 'objectives-metrics' && objectives) ||
      (target === 'design-constraints' && constraints);
    if (filled) continue;
    console.log(`[freeze:${brief.id}] inputs-gen ${target}`);
    const result = await runInputsGen(ctx, {
      target,
      designBrief: briefContent,
      researchContext: research,
      objectivesMetrics: objectives,
      designConstraints: constraints,
    });
    if (target === 'research-context') research = result.text;
    if (target === 'objectives-metrics') objectives = result.text;
    if (target === 'design-constraints') constraints = result.text;
  }

  const spec = assembleSpec({
    briefId: brief.id,
    designBrief: briefContent,
    researchContext: research,
    objectivesMetrics: objectives,
    designConstraints: constraints,
  });
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  console.log(`[freeze:${brief.id}] saved ${specPath}`);
  return spec;
}

// ── Cell definition ────────────────────────────────────────────────────────

type ArmId = 'A-c10-single' | 'B-c5+c5-antirep' | 'C-c5+c5-noantirep';

interface Cell {
  cellId: string;
  arm: ArmId;
  briefId: string;
  rep: number;
}

interface CellResult {
  cellId: string;
  arm: ArmId;
  briefId: string;
  rep: number;
  status: 'done' | 'failed';
  runId: string;
  runRoot: string;
  wallSec: number;
  /** All hypotheses produced by this cell, in stable order across batches. */
  hypotheses: Array<{
    name: string;
    hypothesis: string;
    rationale: string;
    measurements: string;
    /** Which batch within the cell — 0 for arm A; 0 or 1 for arms B/C. */
    batch: number;
  }>;
  /** Whether the second batch (where applicable) was given existingStrategies. */
  antiRepetitionApplied: boolean;
  error?: string;
}

function newMatrixId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-anti-repetition`;
}

// ── Per-cell run ───────────────────────────────────────────────────────────

async function runCell(args: {
  cell: Cell;
  spec: DesignSpec;
  matrixDir: string;
}): Promise<CellResult> {
  const { cell, spec } = args;
  const t0 = performance.now();
  const runDir = createRunDir({ flowName: 'anti-rep', briefId: cell.briefId, dryRun: false });
  const cost = new CostTracker(
    DEFAULT_PER_RUN_TOKEN_CAP,
    runDir.id,
    'anti-rep',
    ledgerPathDefault(),
  );
  const ctx = createStageContext({
    runDir,
    providerId: DEFAULT_PROVIDER,
    modelId: DEFAULT_MODEL,
    cost,
    dryRun: false,
  });

  const collected: CellResult['hypotheses'] = [];
  let antiRepetitionApplied = false;
  let error: string | undefined;

  try {
    if (cell.arm === 'A-c10-single') {
      const r = await runIncubator(ctx, { spec, count: 10 });
      for (const h of r.plan.hypotheses) {
        collected.push({
          name: h.name,
          hypothesis: h.hypothesis,
          rationale: h.rationale,
          measurements: h.measurements ?? '',
          batch: 0,
        });
      }
    } else {
      // Arms B and C: two calls of 5.
      const first = await runIncubator(ctx, { spec, count: 5 });
      for (const h of first.plan.hypotheses) {
        collected.push({
          name: h.name,
          hypothesis: h.hypothesis,
          rationale: h.rationale,
          measurements: h.measurements ?? '',
          batch: 0,
        });
      }
      const passPrior = cell.arm === 'B-c5+c5-antirep';
      antiRepetitionApplied = passPrior;
      const second = await runIncubator(ctx, {
        spec,
        count: 5,
        existingStrategies: passPrior
          ? (first.plan.hypotheses as HypothesisStrategy[])
          : undefined,
      });
      for (const h of second.plan.hypotheses) {
        collected.push({
          name: h.name,
          hypothesis: h.hypothesis,
          rationale: h.rationale,
          measurements: h.measurements ?? '',
          batch: 1,
        });
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    cost.finalizeAndAppendLedger();
  }

  const wallSec = (performance.now() - t0) / 1000;
  return {
    cellId: cell.cellId,
    arm: cell.arm,
    briefId: cell.briefId,
    rep: cell.rep,
    status: error ? 'failed' : 'done',
    runId: runDir.id,
    runRoot: runDir.root,
    wallSec,
    hypotheses: collected,
    antiRepetitionApplied,
    error,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────

function flagInt(argv: string[], name: string): number | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function fmtMin(s: number): string {
  return `${(s / 60).toFixed(1)}m`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const concurrency = flagInt(argv, 'concurrency') ?? 8;
  const reps = flagInt(argv, 'reps') ?? 5;

  const matrixId = newMatrixId();
  const matrixDir = join(MATRIX_ROOT, matrixId);
  const specDir = join(matrixDir, 'specs');
  mkdirSync(specDir, { recursive: true });

  console.log(`[anti-rep] matrix dir: ${matrixDir}`);
  console.log(`[anti-rep] concurrency=${concurrency} reps=${reps}`);

  // ── Phase 1: freeze a spec per brief ───────────────────────────────────
  const freezeRunDir = createRunDir({ flowName: 'anti-rep-freeze', briefId: 'multi', dryRun: false });
  const freezeCost = new CostTracker(
    DEFAULT_PER_RUN_TOKEN_CAP * 4,
    freezeRunDir.id,
    'anti-rep-freeze',
    ledgerPathDefault(),
  );
  const freezeCtx = createStageContext({
    runDir: freezeRunDir,
    providerId: DEFAULT_PROVIDER,
    modelId: DEFAULT_MODEL,
    cost: freezeCost,
    dryRun: false,
  });

  const specs: Record<string, DesignSpec> = {};
  for (const brief of BRIEFS) {
    const briefContent = readFileSync(join(BRIEFS_DIR, brief.briefFile), 'utf8');
    specs[brief.id] = await ensureFrozenSpec(brief, specDir, freezeCtx, briefContent);
  }
  freezeCost.finalizeAndAppendLedger();
  console.log(`[anti-rep] specs frozen for ${Object.keys(specs).length} briefs`);

  // ── Phase 2: build matrix of cells ─────────────────────────────────────
  const arms: ArmId[] = ['A-c10-single', 'B-c5+c5-antirep', 'C-c5+c5-noantirep'];
  const cells: Cell[] = [];
  for (const arm of arms) {
    for (const brief of BRIEFS) {
      for (let r = 0; r < reps; r += 1) {
        cells.push({
          cellId: `${arm}__${brief.id}__r${r}`,
          arm,
          briefId: brief.id,
          rep: r,
        });
      }
    }
  }
  writeFileSync(
    join(matrixDir, 'manifest.json'),
    JSON.stringify({ matrixId, concurrency, reps, cellCount: cells.length, cells }, null, 2),
  );
  console.log(`[anti-rep] manifest: ${cells.length} cells`);

  // ── Phase 3: run cells with bounded concurrency ────────────────────────
  const resultsPath = join(matrixDir, 'results.jsonl');
  writeFileSync(resultsPath, '');
  const t0 = performance.now();
  let idx = 0;
  const state = { done: 0, failed: 0 };

  const worker = async (workerId: number): Promise<void> => {
    while (true) {
      const myIdx = idx;
      idx += 1;
      if (myIdx >= cells.length) return;
      const cell = cells[myIdx];
      const elapsed = (performance.now() - t0) / 1000;
      console.log(
        `[anti-rep] [w${workerId}] [${myIdx + 1}/${cells.length}] starting ${cell.cellId}  (elapsed=${fmtMin(elapsed)})`,
      );
      let result;
      try {
        result = await runCell({ cell, spec: specs[cell.briefId], matrixDir });
      } catch (err) {
        result = {
          cellId: cell.cellId,
          arm: cell.arm,
          briefId: cell.briefId,
          rep: cell.rep,
          status: 'failed' as const,
          runId: 'unknown',
          runRoot: '',
          wallSec: 0,
          hypotheses: [],
          antiRepetitionApplied: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      appendFileSync(resultsPath, JSON.stringify(result) + '\n');
      if (result.status === 'done') state.done += 1;
      else state.failed += 1;
      writeFileSync(
        join(matrixDir, 'status.json'),
        JSON.stringify(
          { matrixId, total: cells.length, done: state.done, failed: state.failed, completed: state.done + state.failed },
          null,
          2,
        ),
      );
      const tag = result.status === 'done' ? 'done' : `FAIL :: ${result.error?.slice(0, 60)}`;
      console.log(
        `[anti-rep] [w${workerId}] [${myIdx + 1}/${cells.length}] ${tag} ${cell.cellId} ${result.wallSec.toFixed(1)}s · hyps=${result.hypotheses.length}  totals: done=${state.done} failed=${state.failed}`,
      );
    }
  };

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));

  const wall = (performance.now() - t0) / 1000;
  console.log('');
  console.log('━'.repeat(60));
  console.log(`[anti-rep] complete  wall=${fmtMin(wall)}  done=${state.done}  failed=${state.failed}`);
  console.log(`[anti-rep] results: ${resultsPath}`);
  console.log('━'.repeat(60));
}

main().catch((err) => {
  console.error('[anti-rep] fatal:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
