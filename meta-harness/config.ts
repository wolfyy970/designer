/**
 * meta-harness/config.json loading and CLI argv parsing.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MetaHarnessMode } from './modes.ts';
import { repoRoot } from './paths.ts';
import { MetaHarnessConfigSchema, type MetaHarnessConfig } from './schemas.ts';

export type { MetaHarnessConfig } from './schemas.ts';

export type MetaHarnessCliArgs = {
  mode: MetaHarnessMode;
  once: boolean;
  evalOnly: boolean;
  dryRun: boolean;
  plain: boolean;
  /** Skip unpromoted-winner preflight scan (TTY diff review / plain diff output). Set by `--skip-promotion-check` or `--improve`. */
  skipPromotionCheck: boolean;
  /** Preflight / diff review only; exit before loading benchmarks or running the harness (no OpenRouter key required). */
  promoteOnly: boolean;
  /** Substrings (OR) matched against each test case JSON basename without `.json`. */
  testFilters: string[];
};

/** Parse --mode from CLI argv. Returns undefined when not specified (so config can provide the default). */
export function parseMetaHarnessModeFromArgv(argv: string[]): MetaHarnessMode | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--mode=')) {
      const v = a.slice('--mode='.length).trim().toLowerCase();
      if (v === 'compile' || v === 'e2e' || v === 'design') return v;
      throw new Error(`Invalid --mode value "${v}". Use compile, e2e, or design.`);
    }
    if (a === '--mode' && argv[i + 1]) {
      const v = argv[i + 1]!.trim().toLowerCase();
      if (v === 'compile' || v === 'e2e' || v === 'design') return v;
      throw new Error(`Invalid --mode value "${v}". Use compile, e2e, or design.`);
    }
  }
  return undefined;
}

/** Resolve mode: CLI flag wins, then config.json, then 'design' as last resort. */
export function resolveMode(argv: string[], cfg: MetaHarnessConfig): MetaHarnessMode {
  return parseMetaHarnessModeFromArgv(argv) ?? cfg.mode ?? 'design';
}

function parseTestFiltersFromArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (const a of argv) {
    if (a.startsWith('--test=')) {
      const v = a.slice('--test='.length).trim();
      if (v) out.push(v);
    }
  }
  return out;
}

export function parseMetaHarnessArgv(argv: string[], cfg?: MetaHarnessConfig): MetaHarnessCliArgs {
  return {
    mode: cfg ? resolveMode(argv, cfg) : (parseMetaHarnessModeFromArgv(argv) ?? 'design'),
    once: argv.includes('--once'),
    evalOnly: argv.includes('--eval-only'),
    dryRun: argv.includes('--dry-run'),
    plain: argv.includes('--plain'),
    skipPromotionCheck: argv.includes('--skip-promotion-check') || argv.includes('--improve'),
    promoteOnly: argv.includes('--promote'),
    testFilters: parseTestFiltersFromArgv(argv),
  };
}

/** OR-match: keep files whose basename (no `.json`) contains any filter substring (case-insensitive). */
export function filterTestFilesBySubstrings(files: string[], filters: string[]): string[] {
  if (!filters.length) return files;
  const subs = filters.map((f) => f.toLowerCase());
  return files.filter((fp) => {
    const base = path.basename(fp, '.json').toLowerCase();
    return subs.some((sub) => base.includes(sub));
  });
}

export async function loadConfig(): Promise<MetaHarnessConfig> {
  const configPath = path.join(repoRoot(), 'meta-harness', 'config.json');
  const rawUnknown = JSON.parse(await readFile(configPath, 'utf8')) as unknown;
  const parsed = MetaHarnessConfigSchema.safeParse(rawUnknown);
  if (!parsed.success) {
    throw new Error(`Invalid meta-harness/config.json: ${parsed.error.message}`);
  }
  return parsed.data;
}
