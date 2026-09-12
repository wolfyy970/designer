#!/usr/bin/env tsx
/**
 * Matrix runner — single-process, in-process flow execution.
 *
 * Replaces the bash subprocess approach for matrix experiments. One Node
 * process loads the monorepo deps once and runs each cell as a function
 * call. Eliminates the per-cell tsx cold-start tax (~5-10s of CPU each ×
 * 335 cells in the cycle-21 plan).
 *
 * **Current scope**: single-cell runner with verbose timing/resource logs.
 * The full 335-cell matrix can be built on top once we know what one cell
 * costs.
 *
 * Usage:
 *   pnpm tsx experiments/scripts/matrix-runner.ts \
 *     --flow ideation \
 *     --brief experiments/briefs/grief-app.md \
 *     [--research X --objectives Y --constraints Z] \
 *     [--count 5] \
 *     [--no-build]
 *
 * Output:
 *   - Run dir created the same way the CLI does (transcripts, hypotheses, etc.)
 *   - Stdout logs per-stage timings, memory snapshots, and a final summary
 *   - One ledger entry written (shared daily ledger semantics preserved)
 */
import { performance } from 'node:perf_hooks';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { basename, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRunDir } from '../src/runDir.ts';
import taskDefaults from '../../config/task-defaults.json';
import {
  CostTracker,
  DEFAULT_DAILY_TOKEN_CAP,
  DEFAULT_PER_RUN_TOKEN_CAP,
  ledgerPathDefault,
} from '../src/cost.ts';
import { runFlow as runCanonical, type CanonicalFlowInput } from '../src/flows/canonical.ts';
import { runFlow as runIdeation } from '../src/flows/ideation.ts';
import { runFlow as runReframeThenIdeate } from '../src/flows/reframe-then-ideate.ts';

const DEFAULT_PROVIDER = 'openrouter';
/** Model the app pins by default, read from config so this cannot drift. */
const DEFAULT_MODEL = taskDefaults.perTaskDefaults.design.modelId;

type FlowName = 'canonical' | 'ideation' | 'reframe-then-ideate';

export interface CellSpec {
  flow: FlowName;
  briefPath: string;
  researchPath?: string;
  objectivesPath?: string;
  constraintsPath?: string;
  count: number;
  evaluate: boolean;
  build: boolean;
  perRunCapTokens: number;
  dailyCapTokens: number;
  providerId: string;
  modelId: string;
}

// ── Resource sampling ──────────────────────────────────────────────────────

interface ResourceSample {
  tSec: number;
  rssMB: number;
  heapUsedMB: number;
}

function memSnapshot(t0: number): ResourceSample {
  const u = process.memoryUsage();
  return {
    tSec: (performance.now() - t0) / 1000,
    rssMB: u.rss / 1024 / 1024,
    heapUsedMB: u.heapUsed / 1024 / 1024,
  };
}

function fmtMB(n: number): string {
  return `${n.toFixed(0)}MB`;
}

function fmtSec(s: number): string {
  return `${s.toFixed(1)}s`;
}

// ── Stage-completion observer ──────────────────────────────────────────────

/**
 * Polls the run dir's transcripts/ folder. Each new file is a stage
 * completing. Surfaces the stage name + durationMs in real time so we can
 * see what's actually slow without waiting for the cell to finish.
 */
function startTranscriptWatcher(
  transcriptsDir: string,
  t0: number,
  log: (line: string) => void,
): { stop: () => void } {
  const seen = new Set<string>();
  const interval = setInterval(() => {
    if (!existsSync(transcriptsDir)) return;
    try {
      const files = readdirSync(transcriptsDir).filter((f) => f.endsWith('.md'));
      for (const f of files) {
        if (seen.has(f)) continue;
        seen.add(f);
        const path = join(transcriptsDir, f);
        let durationMs: number | undefined;
        let tokens: number | undefined;
        try {
          const content = readFileSync(path, 'utf8');
          const durMatch = content.match(/durationMs.*?(\d+)/);
          if (durMatch) durationMs = Number(durMatch[1]);
          const tokMatch = content.match(/total[: ]+(\d+)/i);
          if (tokMatch) tokens = Number(tokMatch[1]);
        } catch {
          /* race: file half-written */
        }
        const wallS = (performance.now() - t0) / 1000;
        const mem = memSnapshot(t0);
        const dur = durationMs ? ` (stage took ${fmtSec(durationMs / 1000)})` : '';
        const tok = tokens ? ` ${tokens.toLocaleString()} tok` : '';
        log(
          `[t=${fmtSec(wallS)}] ✓ ${f.replace(/\.md$/, '')}${dur}${tok}  rss=${fmtMB(mem.rssMB)} heap=${fmtMB(mem.heapUsedMB)}`,
        );
      }
    } catch {
      /* ignore */
    }
  }, 500);
  return { stop: () => clearInterval(interval) };
}

// ── CLI ───────────────────────────────────────────────────────────────────

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

function readOptionalFile(p: string | undefined): { content: string; sourcePath: string } | undefined {
  if (!p) return undefined;
  const abs = resolve(p);
  if (!existsSync(abs)) throw new Error(`File not found: ${abs}`);
  return { content: readFileSync(abs, 'utf8'), sourcePath: abs };
}

// ── Single-cell run ────────────────────────────────────────────────────────

export type FlowNameAll = FlowName;

export interface RunOneCellResult {
  runId: string;
  runRoot: string;
  wallSec: number;
  fatalError?: string;
}

export async function runOneCell(spec: CellSpec): Promise<RunOneCellResult> {
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  const log = (s: string) => {
     
    console.log(s);
  };

  const briefAbs = resolve(spec.briefPath);
  if (!existsSync(briefAbs)) throw new Error(`Brief not found: ${briefAbs}`);
  const designBrief = readFileSync(briefAbs, 'utf8');
  const briefId = basename(briefAbs).replace(/\.[^.]+$/, '');

  const research = readOptionalFile(spec.researchPath);
  const objectives = readOptionalFile(spec.objectivesPath);
  const constraints = readOptionalFile(spec.constraintsPath);

  const runDir = createRunDir({ flowName: spec.flow, briefId, dryRun: false });
  const cost = new CostTracker(spec.perRunCapTokens, runDir.id, spec.flow, ledgerPathDefault());

  log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`[matrix-runner] starting one cell`);
  log(`  flow:    ${spec.flow}`);
  log(`  brief:   ${briefId}`);
  log(`  inputs:  R=${research ? 'user' : 'agent'} O=${objectives ? 'user' : 'agent'} C=${constraints ? 'user' : 'agent'}`);
  log(`  count:   ${spec.count}   build=${spec.build}   evaluate=${spec.evaluate}`);
  log(`  runDir:  ${runDir.id}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('');

  // Memory baseline.
  const memStart = memSnapshot(t0);
  log(`[t=${fmtSec(memStart.tSec)}] baseline rss=${fmtMB(memStart.rssMB)} heap=${fmtMB(memStart.heapUsedMB)}`);

  // Watch transcripts dir so we get real-time stage-completion logs.
  const watcher = startTranscriptWatcher(runDir.transcripts, t0, log);

  // Periodic memory snapshot every 5s while the flow runs.
  const memInterval = setInterval(() => {
    const m = memSnapshot(t0);
    log(`[t=${fmtSec(m.tSec)}] · rss=${fmtMB(m.rssMB)} heap=${fmtMB(m.heapUsedMB)}`);
  }, 5_000);

  const input: CanonicalFlowInput = {
    runDir,
    briefId,
    designBrief,
    providerId: spec.providerId,
    modelId: spec.modelId,
    hypothesisCount: spec.count,
    researchContext: research?.content,
    objectivesMetrics: objectives?.content,
    designConstraints: constraints?.content,
    researchContextSource: research?.sourcePath,
    objectivesMetricsSource: objectives?.sourcePath,
    designConstraintsSource: constraints?.sourcePath,
    cost,
    signal: undefined,
    dryRun: false,
    evaluate: spec.evaluate,
    build: spec.build,
  };

  let fatalError: string | undefined;
  try {
    switch (spec.flow) {
      case 'canonical':
        await runCanonical(input);
        break;
      case 'ideation':
        await runIdeation({ ...input, designBrief });
        break;
      case 'reframe-then-ideate':
        await runReframeThenIdeate({ ...input, designBrief });
        break;
    }
  } catch (err) {
    fatalError = err instanceof Error ? err.message : String(err);
  } finally {
    clearInterval(memInterval);
    watcher.stop();
    cost.finalizeAndAppendLedger();
  }

  // Post-flow integrity check: some flows write a "Fatal error" line to
  // summary.md and return cleanly (e.g. inputs-gen stage failures from a
  // provider stream-idle abort). The canonical signal that the cell
  // succeeded is the presence of hypotheses.json. If it's missing and we
  // didn't already capture a fatalError, surface what the summary says so
  // the matrix orchestrator can class the cell as failed.
  if (!fatalError) {
    const hypPath = join(runDir.root, 'hypotheses.json');
    if (!existsSync(hypPath)) {
      // Try to recover the underlying error from summary.md.
      let summaryErr = 'no hypotheses produced (cell completed but artifact missing)';
      try {
        const summary = readFileSync(join(runDir.root, 'summary.md'), 'utf8');
        const m = summary.match(/## ❌ Fatal error\s*\n\s*```text\s*\n([\s\S]*?)\n```/);
        if (m) summaryErr = m[1].trim().split('\n')[0];
      } catch {
        /* keep default */
      }
      fatalError = `flow completed without producing hypotheses.json — underlying: ${summaryErr}`;
    }
  }

  // ── Final summary ───────────────────────────────────────────────────────
  const cpu1 = process.cpuUsage(cpu0);
  const cpuUserSec = cpu1.user / 1_000_000;
  const cpuSysSec = cpu1.system / 1_000_000;
  const memFinal = memSnapshot(t0);
  const wallSec = memFinal.tSec;

  log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (fatalError) {
    log(`[matrix-runner] CELL FAILED: ${fatalError}`);
  } else {
    log(`[matrix-runner] cell complete`);
  }
  log(`  wall time:    ${fmtSec(wallSec)}`);
  log(`  cpu user:     ${fmtSec(cpuUserSec)}  (${((cpuUserSec / wallSec) * 100).toFixed(0)}% of wall)`);
  log(`  cpu system:   ${fmtSec(cpuSysSec)}`);
  log(`  rss peak:     ${fmtMB(memFinal.rssMB)} (final)`);
  log(`  heap final:   ${fmtMB(memFinal.heapUsedMB)}`);
  log(`  summary:      ${runDir.root}/summary.md`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (fatalError) process.exitCode = 1;
  return { runId: runDir.id, runRoot: runDir.root, wallSec, fatalError };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const flow = (flagStr(argv, 'flow') ?? 'ideation') as FlowName;
  const briefPath = flagStr(argv, 'brief');
  if (!briefPath) {
    console.error('Usage: tsx experiments/scripts/matrix-runner.ts --flow <flow> --brief <path> [--research P] [--objectives P] [--constraints P] [--count N] [--no-build] [--no-evaluate]');
    process.exit(2);
  }
  const validFlows: FlowName[] = ['canonical', 'ideation', 'reframe-then-ideate'];
  if (!validFlows.includes(flow)) {
    console.error(`Unknown flow "${flow}". Valid: ${validFlows.join(', ')}`);
    process.exit(2);
  }

  await runOneCell({
    flow,
    briefPath,
    researchPath: flagStr(argv, 'research'),
    objectivesPath: flagStr(argv, 'objectives'),
    constraintsPath: flagStr(argv, 'constraints'),
    count: flagInt(argv, 'count') ?? 5,
    evaluate: !flagBool(argv, 'no-evaluate'),
    build: !flagBool(argv, 'no-build'),
    perRunCapTokens: flagInt(argv, 'cap-tokens') ?? DEFAULT_PER_RUN_TOKEN_CAP,
    dailyCapTokens: flagInt(argv, 'daily-cap') ?? DEFAULT_DAILY_TOKEN_CAP,
    providerId: flagStr(argv, 'provider') ?? DEFAULT_PROVIDER,
    modelId: flagStr(argv, 'model') ?? DEFAULT_MODEL,
  });
}

// Only run main() when invoked directly, not when imported (e.g. by matrix.ts).
const _entry = process.argv[1] ? resolve(process.argv[1]) : '';
const _self = fileURLToPath(import.meta.url);
if (_entry === _self) {
  main().catch((err) => {

    console.error('[matrix-runner] fatal:', err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}
