/**
 * Experiments CLI entry point.
 *
 *   pnpm exp run <flow> --brief <path> [--dry-run] [--cap-tokens N]
 *                       [--provider P] [--model M] [--count N]
 *                       [--evaluator-provider P] [--evaluator-model M]
 *                       [--no-evaluate]
 *   pnpm exp list
 *   pnpm exp show <run-id>
 *   pnpm exp diff <run-a> <run-b>
 *
 * Flow names map to TypeScript files under `experiments/src/flows/`. Adding
 * a flow = adding a file. The CLI dynamically imports the flow module and
 * calls its exported `runFlow`.
 */
// Bootstrap MUST come first — importing `./bootstrap.ts` triggers env loading
// (via `server/env.ts`) before any provider call.
import './bootstrap.ts';

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { InputsGenerateTargetSpecId } from '../../src/lib/prompts/inputs-generate.ts';
import { createRunDir, readJson, readText } from './runDir.ts';
import taskDefaults from '../../config/task-defaults.json';
import {
  CostCapExceededError,
  CostTracker,
  DEFAULT_DAILY_TOKEN_CAP,
  DEFAULT_PER_RUN_TOKEN_CAP,
  assertDailyCap,
  ledgerPathDefault,
} from './cost.ts';

const DEFAULT_PROVIDER = 'openrouter';
/** Model the app pins by default, read from config so this cannot drift. */
const DEFAULT_MODEL = taskDefaults.perTaskDefaults.design.modelId;

/** Section id aliases — short forms accepted on the CLI. */
const SECTION_ALIASES: Record<string, InputsGenerateTargetSpecId> = {
  'research-context': 'research-context',
  research: 'research-context',
  'objectives-metrics': 'objectives-metrics',
  objectives: 'objectives-metrics',
  'design-constraints': 'design-constraints',
  constraints: 'design-constraints',
};

function resolveSectionId(raw: string): InputsGenerateTargetSpecId | null {
  return SECTION_ALIASES[raw.trim().toLowerCase()] ?? null;
}

function parseSectionList(raw: string): { ok: true; ids: Set<InputsGenerateTargetSpecId> } | { ok: false; bad: string[] } {
  const out = new Set<InputsGenerateTargetSpecId>();
  const bad: string[] = [];
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const id = resolveSectionId(part);
    if (id) out.add(id);
    else bad.push(part);
  }
  if (bad.length > 0) return { ok: false, bad };
  return { ok: true, ids: out };
}

function readOptionalFile(path: string | undefined): { content: string; sourcePath: string } | undefined {
  if (!path) return undefined;
  const abs = resolve(path);
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  return { content: readFileSync(abs, 'utf8'), sourcePath: abs };
}

interface RawArgs {
  command?: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): RawArgs {
  const out: RawArgs = { positional: [], flags: {} };
  if (argv.length === 0) return out;
  out.command = argv[0];
  let i = 1;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith('--')) {
        out.flags[key] = next;
        i += 2;
      } else {
        out.flags[key] = true;
        i += 1;
      }
    } else {
      out.positional.push(a);
      i += 1;
    }
  }
  return out;
}

function flagBool(args: RawArgs, key: string): boolean {
  return args.flags[key] === true || args.flags[key] === 'true';
}
function flagStr(args: RawArgs, key: string): string | undefined {
  const v = args.flags[key];
  return typeof v === 'string' ? v : undefined;
}
function flagInt(args: RawArgs, key: string): number | undefined {
  const v = flagStr(args, key);
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ── Commands ────────────────────────────────────────────────────────────

async function cmdRun(args: RawArgs): Promise<number> {
  const flowName = args.positional[0];
  const briefPath = flagStr(args, 'brief');
  if (!flowName) {
    console.error('Usage: pnpm exp run <flow> --brief <path>');
    return 2;
  }
  if (!briefPath) {
    console.error('Missing required --brief <path>');
    return 2;
  }
  const briefAbs = resolve(briefPath);
  if (!existsSync(briefAbs)) {
    console.error(`Brief not found: ${briefAbs}`);
    return 2;
  }
  const designBrief = readFileSync(briefAbs, 'utf8');
  const briefId = basename(briefAbs).replace(/\.[^.]+$/, '');

  const dryRun = flagBool(args, 'dry-run');
  const evaluate = !flagBool(args, 'no-evaluate');
  // `--no-build` short-circuits the per-hypothesis loop entirely (no build,
  // no eval, no honesty-check). Use for matrix experiments studying upstream
  // stages (brainstorm / curation / inputs-gen / incubator) at scale — the
  // build phase is the slow part, so excluding it gets you 5-10x more runs
  // per hour for the same provider load.
  const build = !flagBool(args, 'no-build');
  const perRunCap = flagInt(args, 'cap-tokens') ?? DEFAULT_PER_RUN_TOKEN_CAP;
  const dailyCap = flagInt(args, 'daily-cap') ?? DEFAULT_DAILY_TOKEN_CAP;
  const providerId = flagStr(args, 'provider') ?? DEFAULT_PROVIDER;
  const modelId = flagStr(args, 'model') ?? DEFAULT_MODEL;
  const evaluatorProviderId = flagStr(args, 'evaluator-provider');
  const evaluatorModelId = flagStr(args, 'evaluator-model');
  const hypothesisCount = flagInt(args, 'count');

  // ── Spec section sourcing flags ────────────────────────────────────
  let researchSrc: ReturnType<typeof readOptionalFile>;
  let objectivesSrc: ReturnType<typeof readOptionalFile>;
  let constraintsSrc: ReturnType<typeof readOptionalFile>;
  let designSystemSrc: ReturnType<typeof readOptionalFile>;
  try {
    researchSrc = readOptionalFile(flagStr(args, 'research'));
    objectivesSrc = readOptionalFile(flagStr(args, 'objectives'));
    constraintsSrc = readOptionalFile(flagStr(args, 'constraints'));
    designSystemSrc = readOptionalFile(flagStr(args, 'design-system'));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  // --regen-inputs <comma-list>
  let regenInputs: Set<InputsGenerateTargetSpecId> | undefined;
  const regenRaw = flagStr(args, 'regen-inputs');
  if (regenRaw) {
    const parsed = parseSectionList(regenRaw);
    if (!parsed.ok) {
      console.error(
        `--regen-inputs: unknown section(s): ${parsed.bad.join(', ')}. Use research-context|objectives-metrics|design-constraints (or short: research|objectives|constraints).`,
      );
      return 2;
    }
    regenInputs = parsed.ids;
  }

  // --target <section>
  let target: InputsGenerateTargetSpecId | undefined;
  const targetRaw = flagStr(args, 'target');
  if (targetRaw) {
    const id = resolveSectionId(targetRaw);
    if (!id) {
      console.error(
        `--target: unknown section "${targetRaw}". Use research-context|objectives-metrics|design-constraints (or short: research|objectives|constraints).`,
      );
      return 2;
    }
    target = id;
    if (flowName !== 'inputs-gen') {
      console.error(
        `--target is only meaningful for the inputs-gen flow. Got --target on flow "${flowName}".`,
      );
      return 2;
    }
  }

  if (!dryRun) {
    try {
      assertDailyCap(dailyCap);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
    if (providerId === 'openrouter') {
      const { requireProviderEnv } = await import('./bootstrap.ts');
      try {
        requireProviderEnv({ providerId });
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        return 2;
      }
    }
  }

  const runDir = createRunDir({ flowName, briefId, dryRun });
  const cost = new CostTracker(perRunCap, runDir.id, flowName, ledgerPathDefault());

  console.log(`[exp] starting run ${runDir.id}`);
  console.log(`      flow=${flowName} provider=${providerId} model=${modelId} dryRun=${dryRun}`);
  console.log(`      brief=${briefAbs}`);
  console.log(`      runDir=${runDir.root}`);

  const flowMod = await loadFlow(flowName);
  if (!flowMod) {
    console.error(`Unknown flow: ${flowName}. Add experiments/src/flows/${flowName}.ts and export runFlow.`);
    return 2;
  }

  const controller = new AbortController();
  const onSig = () => {
    console.warn('[exp] received SIGINT — aborting');
    controller.abort();
  };
  process.on('SIGINT', onSig);

  try {
    await flowMod.runFlow({
      runDir,
      briefId,
      designBrief,
      providerId,
      modelId,
      evaluatorProviderId,
      evaluatorModelId,
      hypothesisCount,
      researchContext: researchSrc?.content,
      objectivesMetrics: objectivesSrc?.content,
      designConstraints: constraintsSrc?.content,
      designSystem: designSystemSrc?.content,
      researchContextSource: researchSrc?.sourcePath,
      objectivesMetricsSource: objectivesSrc?.sourcePath,
      designConstraintsSource: constraintsSrc?.sourcePath,
      designSystemSource: designSystemSrc?.sourcePath,
      regenInputs,
      target,
      cost,
      signal: controller.signal,
      dryRun,
      evaluate,
      build,
    });
  } catch (err) {
    if (err instanceof CostCapExceededError) {
      console.error(`[exp] aborted: ${err.message}`);
    } else {
      console.error('[exp] flow error:', err instanceof Error ? err.message : err);
    }
    // Still finalize the ledger so partial usage is recorded.
    try {
      cost.finalizeAndAppendLedger();
    } catch {
      /* ignore */
    }
    return 1;
  } finally {
    process.off('SIGINT', onSig);
  }

  console.log(`[exp] done. summary: ${runDir.summary}`);
  return 0;
}

interface FlowModule {
  runFlow: (input: Record<string, unknown>) => Promise<unknown>;
}

async function loadFlow(name: string): Promise<FlowModule | null> {
  const safe = name.replace(/[^a-z0-9_-]+/gi, '');
  if (!safe) return null;
  const path = resolve(process.cwd(), 'experiments', 'src', 'flows', `${safe}.ts`);
  if (!existsSync(path)) return null;
  // Use file URL so tsx/ESM resolves correctly across platforms.
  const url = new URL(`file://${path}`);
  const mod = await import(url.href);
  if (typeof mod.runFlow !== 'function') return null;
  return mod as FlowModule;
}

function cmdList(): number {
  const runsRoot = join(process.cwd(), 'experiments', 'runs');
  if (!existsSync(runsRoot)) {
    console.log('(no runs)');
    return 0;
  }
  const entries = readdirSync(runsRoot)
    .filter((name) => name !== '.gitkeep')
    .filter((name) => statSync(join(runsRoot, name)).isDirectory())
    .sort()
    .reverse();
  if (entries.length === 0) {
    console.log('(no runs)');
    return 0;
  }
  for (const id of entries) {
    const cfg = readJson<{ flowName?: string; dryRun?: boolean; durationMs?: number }>(
      join(runsRoot, id, 'config.json'),
    );
    const tag = cfg?.dryRun ? '[dry-run]' : '[live]';
    const flow = cfg?.flowName ?? '?';
    const dur = cfg?.durationMs != null ? ` ${cfg.durationMs}ms` : '';
    console.log(`${id}  ${flow.padEnd(20)} ${tag}${dur}`);
  }
  return 0;
}

function cmdShow(args: RawArgs): number {
  const id = args.positional[0];
  if (!id) {
    console.error('Usage: pnpm exp show <run-id>');
    return 2;
  }
  const summary = readText(join(process.cwd(), 'experiments', 'runs', id, 'summary.md'));
  if (!summary) {
    console.error(`No summary found for run ${id}`);
    return 1;
  }
  process.stdout.write(summary);
  if (!summary.endsWith('\n')) process.stdout.write('\n');
  return 0;
}

async function cmdOpen(args: RawArgs): Promise<number> {
  const id = args.positional[0];
  if (!id) {
    console.error('Usage: pnpm exp open <run-id>');
    console.error('       pnpm exp open latest                # opens the most recent run');
    return 2;
  }
  const runsRoot = join(process.cwd(), 'experiments', 'runs');
  let runId = id;
  if (id === 'latest') {
    const entries = existsSync(runsRoot)
      ? readdirSync(runsRoot)
          .filter((name) => name !== '.gitkeep')
          .filter((name) => statSync(join(runsRoot, name)).isDirectory())
          .sort()
          .reverse()
      : [];
    if (entries.length === 0) {
      console.error('No runs found.');
      return 1;
    }
    runId = entries[0]!;
    console.log(`[exp] opening latest run: ${runId}`);
  }
  const runDir = join(runsRoot, runId);
  if (!existsSync(runDir)) {
    console.error(`Run not found: ${runId}`);
    return 1;
  }
  // Prefer preview.html when present (canonical and variants); fall back to summary.md.
  let previewPath = join(runDir, 'preview.html');
  if (!existsSync(previewPath)) {
    // Old run from before preview.html was introduced — regenerate from on-disk data.
    const regenerated = await regeneratePreviewForRun(runId, runDir);
    if (regenerated) {
      previewPath = regenerated;
      console.log(`[exp] regenerated preview.html for older run`);
    }
  }
  const target = existsSync(previewPath) ? previewPath : join(runDir, 'summary.md');
  if (!existsSync(target)) {
    console.error(`Nothing to open in run ${runId} (neither preview.html nor summary.md found).`);
    return 1;
  }
  const opener = openCommand();
  if (!opener) {
    console.log(`Open this in your browser: file://${target}`);
    return 0;
  }
  const { execFile } = await import('node:child_process');
  await new Promise<void>((res, rej) => {
    execFile(opener, [target], (err) => {
      if (err) rej(err);
      else res();
    });
  }).catch((err) => {
    console.error(`Failed to open ${target}: ${err instanceof Error ? err.message : err}`);
    console.log(`Open this manually: file://${target}`);
  });
  return 0;
}

/** Returns the platform-appropriate "open this file in default app" command, or null when unknown. */
function openCommand(): string | null {
  const platform = process.platform;
  if (platform === 'darwin') return 'open';
  if (platform === 'win32') return 'start';
  if (platform === 'linux') return 'xdg-open';
  return null;
}

/**
 * Reconstructs the run dir + plan + per-hypothesis summaries from on-disk
 * artifacts and calls writePreview. Lets `open` work on runs that pre-date
 * the preview-generation feature.
 */
async function regeneratePreviewForRun(runId: string, runRoot: string): Promise<string | null> {
  const planPath = join(runRoot, 'hypotheses.json');
  const cfgPath = join(runRoot, 'config.json');
  if (!existsSync(planPath)) return null;
  const plan = readJson<{
    id?: string;
    specId?: string;
    dimensions?: unknown[];
    hypotheses?: Array<{ id: string; name: string; dimensionValues?: Record<string, string> }>;
    generatedAt?: string;
    incubatorModel?: string;
  }>(planPath);
  if (!plan || !Array.isArray(plan.hypotheses) || plan.hypotheses.length === 0) return null;
  const cfg = readJson<{ flowName?: string; briefId?: string; dryRun?: boolean }>(cfgPath);

  const runDir: import('./runDir.ts').RunDir = {
    id: runId,
    flowName: cfg?.flowName ?? 'unknown',
    briefId: cfg?.briefId ?? 'unknown',
    dryRun: cfg?.dryRun ?? false,
    root: runRoot,
    summary: join(runRoot, 'summary.md'),
    config: join(runRoot, 'config.json'),
    spec: join(runRoot, 'spec.md'),
    hypotheses: planPath,
    transcripts: join(runRoot, 'transcripts'),
    artifacts: join(runRoot, 'artifacts'),
    evals: join(runRoot, 'evals'),
    critique: join(runRoot, 'critique.md'),
    feedback: join(runRoot, 'feedback.md'),
  };

  const { writePreview } = await import('./preview.ts');
  // Build minimal per-hypothesis summaries from what's on disk.
  const perHyp = plan.hypotheses.map((h) => ({
    hypothesisId: h.id,
    name: h.name,
    artifactsDir: join('artifacts', h.id),
  }));

  return writePreview({
    runDir,
    flowName: cfg?.flowName ?? 'unknown',
    briefId: cfg?.briefId ?? 'unknown',
    plan: plan as unknown as import('../../src/types/incubator.ts').IncubationPlan,
    hypotheses: perHyp,
    dryRun: cfg?.dryRun ?? false,
  });
}

function cmdDiff(args: RawArgs): number {
  const a = args.positional[0];
  const b = args.positional[1];
  if (!a || !b) {
    console.error('Usage: pnpm exp diff <run-a> <run-b>');
    return 2;
  }
  const root = join(process.cwd(), 'experiments', 'runs');
  const cfgA = readJson<Record<string, unknown>>(join(root, a, 'config.json'));
  const cfgB = readJson<Record<string, unknown>>(join(root, b, 'config.json'));
  const planA = readJson<{ hypotheses?: Array<{ name: string; hypothesis: string }> }>(
    join(root, a, 'hypotheses.json'),
  );
  const planB = readJson<{ hypotheses?: Array<{ name: string; hypothesis: string }> }>(
    join(root, b, 'hypotheses.json'),
  );

  console.log(`# Diff ${a} ⇄ ${b}\n`);
  console.log('## Config');
  console.log('```diff');
  console.log(`- ${a}: ${JSON.stringify(cfgA, null, 2)}`);
  console.log(`+ ${b}: ${JSON.stringify(cfgB, null, 2)}`);
  console.log('```\n');

  console.log('## Hypotheses (names + first 200 chars of `hypothesis` prose)\n');
  console.log(`### ${a}`);
  for (const h of planA?.hypotheses ?? []) {
    console.log(`- **${h.name}**: ${(h.hypothesis ?? '').slice(0, 200)}`);
  }
  console.log(`\n### ${b}`);
  for (const h of planB?.hypotheses ?? []) {
    console.log(`- **${h.name}**: ${(h.hypothesis ?? '').slice(0, 200)}`);
  }

  // Eval scores comparison
  console.log('\n## Eval scores (averages)\n');
  const evalsA = scoresAverages(join(root, a, 'evals'));
  const evalsB = scoresAverages(join(root, b, 'evals'));
  console.log(`### ${a}`);
  console.log(formatScores(evalsA));
  console.log(`\n### ${b}`);
  console.log(formatScores(evalsB));
  return 0;
}

function scoresAverages(dir: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const data = readJson<Record<string, { scores?: Record<string, { score?: number }> }>>(
      join(dir, f),
    );
    if (!data) continue;
    let sum = 0;
    let n = 0;
    for (const r of Object.values(data)) {
      for (const s of Object.values(r?.scores ?? {})) {
        if (typeof s.score === 'number' && Number.isFinite(s.score)) {
          sum += s.score;
          n++;
        }
      }
    }
    out[f] = n > 0 ? sum / n : null;
  }
  return out;
}

function formatScores(scores: Record<string, number | null>): string {
  const keys = Object.keys(scores);
  if (keys.length === 0) return '(no evals)';
  return keys.map((k) => `- ${k}: ${scores[k] != null ? scores[k]!.toFixed(2) : 'n/a'}`).join('\n');
}

function printHelp(): void {
  console.log(
    [
      'Experiments CLI',
      '',
      'Commands:',
      '  run <flow> --brief <path> [flags]   Run a flow against a brief',
      '  list                                List recent runs',
      '  show <run-id>                       Print summary.md for a run',
      '  open <run-id>                       Open the run preview gallery (or `latest`)',
      '  diff <run-a> <run-b>                Compare two runs',
      '',
      'Flags for `run`:',
      '  --dry-run                  Compose prompts but do not call providers',
      '  --cap-tokens N             Per-run token cap (default 200000)',
      '  --daily-cap N              Daily token cap (default 1000000)',
      '  --provider <id>            Provider (default openrouter)',
      '  --model <id>               Model (default: config/task-defaults.json)',
      '  --evaluator-provider <id>  Override provider for evaluator',
      '  --evaluator-model <id>     Override model for evaluator',
      '  --count N                  Hypothesis count for incubator',
      '  --no-evaluate              Skip stage 4 evaluation',
      '  --no-build                 Skip stage 3 design build (and dependent stages: evaluation, honesty-check). Useful for matrix experiments studying upstream stages at scale.',
      '',
      'Spec section sourcing (any flow):',
      '  --research <path>          Pre-supply research-context from a file',
      '  --objectives <path>        Pre-supply objectives-metrics from a file',
      '  --constraints <path>       Pre-supply design-constraints from a file',
      '  --design-system <path>     Pre-supply design-system snapshot from a file',
      '  --regen-inputs <list>      Force-regenerate listed sections even when supplied',
      '                             (research[-context], objectives[-metrics], design-constraints[/constraints])',
      '',
      'Inputs-gen flow only:',
      '  --target <section>         Generate only this one section',
      '',
      'Available flows: see experiments/src/flows/*.ts',
    ].join('\n'),
  );
}

// ── Entry ───────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === 'help' || args.command === '--help' || args.command === '-h') {
    printHelp();
    return 0;
  }
  switch (args.command) {
    case 'run':
      return cmdRun(args);
    case 'list':
      return cmdList();
    case 'show':
      return cmdShow(args);
    case 'open':
      return cmdOpen(args);
    case 'diff':
      return cmdDiff(args);
    default:
      console.error(`Unknown command: ${args.command}`);
      printHelp();
      return 2;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
