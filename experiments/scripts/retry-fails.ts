#!/usr/bin/env tsx
/**
 * Retry failed cells from a matrix run.
 *
 * Reads results.jsonl + cells.json from the matrix dir, identifies which
 * cells either hard-failed or completed without producing hypotheses.json,
 * re-runs them with bounded concurrency, and appends the outcomes to a
 * fresh retry-results.jsonl in the matrix dir.
 *
 * Used to confirm whether a "silent failure" (e.g. provider stream-idle
 * abort caught by the watchdog) is transient.
 *
 * Usage:
 *   pnpm tsx experiments/scripts/retry-fails.ts \
 *     --matrix-dir <path> \
 *     [--concurrency 6]
 */
import { existsSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

// Mirror the brief table from matrix.ts. Kept duplicated rather than
// exported so retry-fails stays self-contained.
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

interface ResultLine {
  cellId: string;
  flow: FlowNameAll;
  briefId: string;
  mix: string;
  count: number;
  rep: number;
  status: 'done' | 'failed' | 'pending' | 'running';
  runId?: string;
  runRoot?: string;
  wallSec?: number;
  error?: string;
}

interface CellAggregate { runId: string }

function cellToSpec(c: ResultLine): CellSpec {
  const brief = BRIEFS.find((b) => b.id === c.briefId);
  if (!brief) throw new Error(`Unknown briefId: ${c.briefId}`);
  const briefPath = join(BRIEFS_DIR, brief.briefFile);
  const research = brief.inputs?.research ? join(BRIEFS_DIR, brief.inputs.research) : undefined;
  const objectives = brief.inputs?.objectives ? join(BRIEFS_DIR, brief.inputs.objectives) : undefined;
  const constraints = brief.inputs?.constraints ? join(BRIEFS_DIR, brief.inputs.constraints) : undefined;
  const useR = c.mix === 'user-R' || c.mix === 'user-all';
  const useO = c.mix === 'user-O' || c.mix === 'user-all';
  const useC = c.mix === 'user-C' || c.mix === 'user-all';
  return {
    flow: c.flow,
    briefPath,
    researchPath: useR ? research : undefined,
    objectivesPath: useO ? objectives : undefined,
    constraintsPath: useC ? constraints : undefined,
    count: c.count,
    evaluate: false,
    build: false,
    perRunCapTokens: DEFAULT_PER_RUN_TOKEN_CAP,
    dailyCapTokens: DEFAULT_DAILY_TOKEN_CAP,
    providerId: DEFAULT_PROVIDER,
    modelId: DEFAULT_MODEL,
  };
}

function flagStr(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return argv[i + 1];
}
function flagInt(argv: string[], name: string): number | undefined {
  const v = flagStr(argv, name);
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function fmtMin(s: number): string {
  return `${(s / 60).toFixed(1)}m`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const matrixDir = flagStr(argv, 'matrix-dir');
  if (!matrixDir) {
    console.error('Usage: tsx experiments/scripts/retry-fails.ts --matrix-dir <path> [--concurrency 6]');
    process.exit(2);
  }
  const dir = resolve(matrixDir);
  if (!existsSync(dir)) {
    console.error(`Matrix dir not found: ${dir}`);
    process.exit(2);
  }
  const concurrency = flagInt(argv, 'concurrency') ?? 6;

  const results: ResultLine[] = readFileSync(join(dir, 'results.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as ResultLine);
  const cells: CellAggregate[] = JSON.parse(readFileSync(join(dir, 'cells.json'), 'utf8'));
  const withHyps = new Set(cells.map((c) => c.runId));

  // Cells to retry: hard-failed OR done-without-hypotheses.
  const toRetry: ResultLine[] = [];
  for (const r of results) {
    if (r.status === 'failed') {
      toRetry.push(r);
    } else if (r.status === 'done' && r.runId && !withHyps.has(r.runId)) {
      toRetry.push(r);
    }
  }
  console.log(`[retry] ${toRetry.length} cells to retry (concurrency=${concurrency})`);
  for (const r of toRetry) console.log(`  - ${r.cellId}  (was: ${r.status}${r.error ? ` :: ${r.error.slice(0, 80)}` : ''})`);

  const outPath = join(dir, 'retry-results.jsonl');
  writeFileSync(outPath, '');

  const t0 = performance.now();
  let idx = 0;
  const worker = async (workerId: number): Promise<void> => {
    while (true) {
      const myIdx = idx;
      idx += 1;
      if (myIdx >= toRetry.length) return;
      const r = toRetry[myIdx];
      const elapsed = (performance.now() - t0) / 1000;
      console.log(`[retry] [w${workerId}] [${myIdx + 1}/${toRetry.length}] starting ${r.cellId} (elapsed=${fmtMin(elapsed)})`);
      let res;
      try {
        res = await runOneCell(cellToSpec(r));
      } catch (err) {
        res = { runId: 'unknown', runRoot: '', wallSec: 0, fatalError: err instanceof Error ? err.message : String(err) };
      }
      const status = res.fatalError ? 'failed' : 'done';
      console.log(`[retry] [w${workerId}] [${myIdx + 1}/${toRetry.length}] ${status} ${r.cellId} ${res.wallSec.toFixed(1)}s${res.fatalError ? ` :: ${res.fatalError.slice(0, 80)}` : ''}`);
      appendFileSync(outPath, JSON.stringify({
        cellId: r.cellId,
        flow: r.flow,
        briefId: r.briefId,
        mix: r.mix,
        count: r.count,
        rep: r.rep,
        status,
        runId: res.runId,
        runRoot: res.runRoot,
        wallSec: res.wallSec,
        error: res.fatalError,
        originalStatus: r.status,
        originalError: r.error,
        originalRunId: r.runId,
        finishedAt: new Date().toISOString(),
      }) + '\n');
    }
  };

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));

  // Summary.
  const out: Array<{ status: string; cellId: string }> = readFileSync(outPath, 'utf8')
    .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const wall = (performance.now() - t0) / 1000;
  const ok = out.filter((r) => r.status === 'done').length;
  const fail = out.filter((r) => r.status === 'failed').length;
  console.log('');
  console.log('━'.repeat(60));
  console.log(`[retry] complete  wall=${fmtMin(wall)}  retried=${out.length}  ok=${ok}  failed=${fail}`);
  console.log(`[retry] retry-results: ${outPath}`);
  console.log('━'.repeat(60));
}

main().catch((err) => {
  console.error('[retry] fatal:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
