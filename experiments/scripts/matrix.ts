#!/usr/bin/env tsx
/**
 * Matrix orchestrator — multi-cell, in-process runner.
 *
 * Builds a parametric cross-product of (flow × brief × input-mix × count × rep),
 * runs them with bounded concurrency, and writes a single matrix directory
 * with a manifest, live status, and a results JSONL.
 *
 * Usage:
 *   pnpm tsx experiments/scripts/matrix.ts \
 *     --scope pilot|full \
 *     [--concurrency 4] \
 *     [--no-build]    (default; matrix is upstream-stage focused)
 *     [--matrix-id <id>]   (resume an existing matrix dir)
 *
 * Output:
 *   experiments/matrix/<matrix-id>/
 *     manifest.json     full cell list
 *     status.json       live { pending, running, done, failed } counts + per-cell state
 *     results.jsonl     append-only one line per finished cell
 *     log.txt           rolling log of orchestrator-level events
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import taskDefaults from '../../config/task-defaults.json';

import {
  DEFAULT_DAILY_TOKEN_CAP,
  DEFAULT_PER_RUN_TOKEN_CAP,
} from '../src/cost.ts';
import { runOneCell, type CellSpec, type FlowNameAll } from './matrix-runner.ts';

const DEFAULT_PROVIDER = 'openrouter';
/** Model the app pins by default, read from config so this cannot drift. */
const DEFAULT_MODEL = taskDefaults.perTaskDefaults.design.modelId;

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const BRIEFS_DIR = join(REPO_ROOT, 'experiments/briefs');
const MATRIX_ROOT = join(REPO_ROOT, 'experiments/matrix');

// ── Matrix definition ──────────────────────────────────────────────────────

type InputMix =
  | 'all-agent'
  | 'user-R'
  | 'user-O'
  | 'user-C'
  | 'user-all';

interface BriefSpec {
  id: string;
  briefFile: string;
  inputs?: { research?: string; objectives?: string; constraints?: string };
}

const BRIEFS: BriefSpec[] = [
  {
    id: 'grief-app',
    briefFile: 'grief-app.md',
    inputs: {
      research: 'grief-app-research.md',
      objectives: 'grief-app-objectives.md',
      constraints: 'grief-app-constraints.md',
    },
  },
  { id: 'code-onboarding', briefFile: 'code-onboarding.md' },
  { id: 'habit-tracker', briefFile: 'habit-tracker.md' },
  { id: 'icu-handoff', briefFile: 'icu-handoff.md' },
];

/**
 * `reframe-upstream` was retired post-cycle-21 (matrix showed it within
 * rep-noise of canonical — no measurable theme-spread benefit). Kept
 * `reframe-then-ideate` as the only composition-flow data point.
 */
const FLOWS: FlowNameAll[] = ['canonical', 'ideation', 'reframe-then-ideate'];

interface MatrixCell {
  cellId: string;
  flow: FlowNameAll;
  briefId: string;
  mix: InputMix;
  count: number;
  rep: number;
}

function buildMatrix(scope: 'pilot' | 'full'): MatrixCell[] {
  const cells: MatrixCell[] = [];
  const flows = scope === 'pilot' ? FLOWS : FLOWS;
  const briefIds = scope === 'pilot' ? ['grief-app', 'code-onboarding'] : BRIEFS.map((b) => b.id);
  const counts = scope === 'pilot' ? [5] : [3, 5, 7, 10];
  const reps = scope === 'pilot' ? 1 : 3;

  for (const flow of flows) {
    for (const briefId of briefIds) {
      const brief = BRIEFS.find((b) => b.id === briefId)!;
      const mixes: InputMix[] = brief.inputs
        ? scope === 'pilot'
          ? ['all-agent']
          : ['all-agent', 'user-R', 'user-O', 'user-C', 'user-all']
        : ['all-agent'];
      for (const mix of mixes) {
        for (const count of counts) {
          for (let r = 0; r < reps; r += 1) {
            cells.push({
              cellId: `${flow}__${briefId}__${mix}__c${count}__r${r}`,
              flow,
              briefId,
              mix,
              count,
              rep: r,
            });
          }
        }
      }
    }
  }
  return cells;
}

function cellToSpec(cell: MatrixCell, build: boolean): CellSpec {
  const brief = BRIEFS.find((b) => b.id === cell.briefId)!;
  const briefPath = join(BRIEFS_DIR, brief.briefFile);
  const research = brief.inputs?.research ? join(BRIEFS_DIR, brief.inputs.research) : undefined;
  const objectives = brief.inputs?.objectives ? join(BRIEFS_DIR, brief.inputs.objectives) : undefined;
  const constraints = brief.inputs?.constraints ? join(BRIEFS_DIR, brief.inputs.constraints) : undefined;

  const useR = cell.mix === 'user-R' || cell.mix === 'user-all';
  const useO = cell.mix === 'user-O' || cell.mix === 'user-all';
  const useC = cell.mix === 'user-C' || cell.mix === 'user-all';

  return {
    flow: cell.flow,
    briefPath,
    researchPath: useR ? research : undefined,
    objectivesPath: useO ? objectives : undefined,
    constraintsPath: useC ? constraints : undefined,
    count: cell.count,
    evaluate: false,
    build,
    perRunCapTokens: DEFAULT_PER_RUN_TOKEN_CAP,
    dailyCapTokens: DEFAULT_DAILY_TOKEN_CAP,
    providerId: DEFAULT_PROVIDER,
    modelId: DEFAULT_MODEL,
  };
}

// ── CLI parsing ────────────────────────────────────────────────────────────

function flagStr(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return argv[i + 1];
}
function flagBool(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}
function flagInt(argv: string[], name: string): number | undefined {
  const v = flagStr(argv, name);
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

// ── State persistence ──────────────────────────────────────────────────────

interface CellState {
  cellId: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  runId?: string;
  wallSec?: number;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

interface MatrixState {
  matrixId: string;
  scope: 'pilot' | 'full';
  startedAt: string;
  concurrency: number;
  build: boolean;
  totals: { total: number; pending: number; running: number; done: number; failed: number };
  cells: Record<string, CellState>;
}

function fmtSec(s: number): string {
  return `${s.toFixed(1)}s`;
}
function fmtMin(s: number): string {
  return `${(s / 60).toFixed(1)}m`;
}

function newMatrixId(scope: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${stamp}-matrix-${scope}`;
}

function writeStatus(matrixDir: string, state: MatrixState): void {
  writeFileSync(join(matrixDir, 'status.json'), JSON.stringify(state, null, 2));
}

function appendResult(matrixDir: string, line: object): void {
  appendFileSync(join(matrixDir, 'results.jsonl'), JSON.stringify(line) + '\n');
}

function appendLog(matrixDir: string, line: string): void {
  const stamp = new Date().toISOString();
  appendFileSync(join(matrixDir, 'log.txt'), `[${stamp}] ${line}\n`);
}

// ── Orchestrator ───────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const scope = ((flagStr(argv, 'scope') ?? 'pilot') as 'pilot' | 'full');
  if (scope !== 'pilot' && scope !== 'full') {
    console.error('--scope must be "pilot" or "full"');
    process.exit(2);
  }
  const concurrency = flagInt(argv, 'concurrency') ?? 4;
  // Matrix is always --no-build for now (upstream-stage focused).
  // The --no-build flag is accepted for explicitness but the behavior is fixed.
  const _hasNoBuild = flagBool(argv, 'no-build');
  void _hasNoBuild;
  const build = false;
  const resumeId = flagStr(argv, 'matrix-id');

  if (!existsSync(MATRIX_ROOT)) mkdirSync(MATRIX_ROOT, { recursive: true });
  const matrixId = resumeId ?? newMatrixId(scope);
  const matrixDir = join(MATRIX_ROOT, matrixId);
  if (!existsSync(matrixDir)) mkdirSync(matrixDir, { recursive: true });

  // Build or resume.
  const cells = buildMatrix(scope);
  let state: MatrixState;
  const statusPath = join(matrixDir, 'status.json');
  if (resumeId && existsSync(statusPath)) {
    state = JSON.parse(readFileSync(statusPath, 'utf8'));
    // Resume: reset any 'running' back to 'pending' (they were interrupted).
    for (const c of Object.values(state.cells)) {
      if (c.status === 'running') c.status = 'pending';
    }
  } else {
    state = {
      matrixId,
      scope,
      startedAt: new Date().toISOString(),
      concurrency,
      build,
      totals: { total: cells.length, pending: cells.length, running: 0, done: 0, failed: 0 },
      cells: Object.fromEntries(cells.map((c) => [c.cellId, { cellId: c.cellId, status: 'pending' } as CellState])),
    };
    writeFileSync(join(matrixDir, 'manifest.json'), JSON.stringify({ matrixId, scope, build, concurrency, cells }, null, 2));
  }

  // Recompute totals
  const recount = () => {
    const totals = { total: cells.length, pending: 0, running: 0, done: 0, failed: 0 };
    for (const c of Object.values(state.cells)) totals[c.status] += 1;
    state.totals = totals;
  };
  recount();
  writeStatus(matrixDir, state);

  appendLog(matrixDir, `matrix start id=${matrixId} scope=${scope} cells=${cells.length} concurrency=${concurrency}`);
  console.log(`[matrix] id=${matrixId} scope=${scope} cells=${cells.length} concurrency=${concurrency} build=${build}`);
  console.log(`[matrix] dir=${matrixDir}`);

  // Run loop: simple promise-pool over pending cells.
  const pending = cells.filter((c) => state.cells[c.cellId].status !== 'done');
  let idx = 0;
  const t0 = performance.now();

  const worker = async (workerId: number): Promise<void> => {
    while (true) {
      const myIdx = idx;
      idx += 1;
      if (myIdx >= pending.length) return;
      const cell = pending[myIdx];
      const cs = state.cells[cell.cellId];
      cs.status = 'running';
      cs.startedAt = new Date().toISOString();
      recount();
      writeStatus(matrixDir, state);
      const elapsed = (performance.now() - t0) / 1000;
      console.log(`[matrix] [w${workerId}] [${myIdx + 1}/${pending.length}] starting ${cell.cellId}  (elapsed=${fmtMin(elapsed)})`);
      appendLog(matrixDir, `start ${cell.cellId}`);

      let result;
      try {
        result = await runOneCell(cellToSpec(cell, build));
      } catch (err) {
        result = { runId: 'unknown', runRoot: '', wallSec: 0, fatalError: err instanceof Error ? err.message : String(err) };
      }
      cs.runId = result.runId;
      cs.wallSec = result.wallSec;
      cs.finishedAt = new Date().toISOString();
      if (result.fatalError) {
        cs.status = 'failed';
        cs.error = result.fatalError;
        appendLog(matrixDir, `FAIL ${cell.cellId} ${fmtSec(result.wallSec)} :: ${result.fatalError}`);
      } else {
        cs.status = 'done';
        appendLog(matrixDir, `done ${cell.cellId} ${fmtSec(result.wallSec)} run=${result.runId}`);
      }
      appendResult(matrixDir, {
        cellId: cell.cellId,
        flow: cell.flow,
        briefId: cell.briefId,
        mix: cell.mix,
        count: cell.count,
        rep: cell.rep,
        status: cs.status,
        runId: cs.runId,
        runRoot: result.runRoot,
        wallSec: cs.wallSec,
        error: cs.error,
        startedAt: cs.startedAt,
        finishedAt: cs.finishedAt,
      });
      recount();
      writeStatus(matrixDir, state);
      const eRunning = (performance.now() - t0) / 1000;
      console.log(
        `[matrix] [w${workerId}] [${myIdx + 1}/${pending.length}] ${cs.status} ${cell.cellId} ${fmtSec(result.wallSec)}  totals: done=${state.totals.done} failed=${state.totals.failed} pending=${state.totals.pending} running=${state.totals.running} (elapsed=${fmtMin(eRunning)})`,
      );
    }
  };

  const workers = Array.from({ length: concurrency }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  const wallSec = (performance.now() - t0) / 1000;
  appendLog(matrixDir, `matrix complete totals=${JSON.stringify(state.totals)} wall=${fmtMin(wallSec)}`);
  console.log('');
  console.log('━'.repeat(80));
  console.log(`[matrix] complete  wall=${fmtMin(wallSec)}  done=${state.totals.done}  failed=${state.totals.failed}`);
  console.log(`[matrix] dir=${matrixDir}`);
  console.log('━'.repeat(80));
}

main().catch((err) => {
  console.error('[matrix] fatal:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
