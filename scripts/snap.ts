/**
 * Smart snapshots: `pnpm snap` compares versioned files to their latest snapshot and saves only what changed.
 * Subcommands mirror version-snapshot for list/diff/restore.
 */
import { access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {
  diffCurrentVsSnapshot,
  diffVersions,
  enumerateVersionedFiles,
  listVersions,
  restoreVersion,
  snapAll,
  snapshotBeforeWrite,
  snapshotDirForRelPath,
} from '../meta-harness/version-store.ts';

function usage(): never {
  console.error(`Usage:
  pnpm snap                              snapshot all changed versioned files (skills, PROMPT.md, rubric)
  pnpm snap --hook                       same as above, for Husky (quiet; stages new files if any)
  pnpm snap --list <path>                list saved versions (newest first)
  pnpm snap --diff <path> <safeTsA> <safeTsB>   unified diff between two snapshots
  pnpm snap --diff-current <path> [safeTs]     diff snapshot vs working file (default: latest)
  pnpm snap --restore <path> <safeTs>           restore working file from snapshot
  pnpm snap <repo-relative-path> […]     legacy: snapshot current file(s) before manual edit
`);
  process.exit(1);
}

function normalizeRepoRel(raw: string): string {
  return path.normalize(raw).split(path.sep).join('/').replace(/^\/+/, '');
}

function isVersionedPath(rel: string): boolean {
  const n = normalizeRepoRel(rel);
  if (n.includes('..')) return false;
  if (n === 'prompts/designer-agentic-system/PROMPT.md') return true;
  if (n === 'src/lib/rubric-weights.json') return true;
  if (n.startsWith('skills/')) return true;
  return false;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const repoRoot = process.cwd();

  if (argv[0] === '--hook') {
    if (process.env.SKIP_SNAP === '1') {
      return;
    }
    const result = await snapAll(repoRoot, 'husky:pre-commit');
    if (result.saved.length === 0) {
      return;
    }
    try {
      execFileSync('git', ['add', '--', path.join(repoRoot, '.prompt-versions', 'manifest.jsonl')], {
        cwd: repoRoot,
        stdio: 'ignore',
      });
    } catch {
      /* manifest may not exist */
    }
    for (const rel of result.saved) {
      const dir = snapshotDirForRelPath(repoRoot, rel);
      try {
        execFileSync('git', ['add', '--', dir], { cwd: repoRoot, stdio: 'ignore' });
      } catch {
        /* */
      }
    }
    return;
  }

  if (argv.length === 0) {
    const tracked = await enumerateVersionedFiles(repoRoot);
    if (tracked.length === 0) {
      console.warn('No versioned files found (skills/*/SKILL.md, PROMPT.md, rubric-weights.json).');
      return;
    }
    const result = await snapAll(repoRoot, 'manual:snap');
    if (result.saved.length === 0 && result.missing.length === 0) {
      console.log('Everything up to date — nothing changed since last snapshot.');
      return;
    }
    if (result.saved.length > 0) {
      console.log(`Saved: ${result.saved.join(', ')}`);
    }
    if (result.unchanged.length > 0) {
      console.log(`Unchanged: ${result.unchanged.length} file(s)`);
    }
    if (result.missing.length > 0) {
      console.warn(`Skipped (unreadable or error): ${result.missing.join(', ')}`);
    }
    return;
  }

  if (argv[0] === '--list') {
    const rel = argv[1];
    if (!rel) usage();
    const n = normalizeRepoRel(rel);
    if (!isVersionedPath(n)) {
      console.error(`Path not in versioned scope: ${n}`);
      process.exit(1);
    }
    const entries = await listVersions({ repoRoot, relPath: n });
    if (entries.length === 0) {
      console.log('(no snapshots)');
      return;
    }
    for (const e of entries) {
      console.log(`${e.safeTs}\t${e.hash}\t${e.ts}`);
    }
    return;
  }

  if (argv[0] === '--diff') {
    const rel = argv[1];
    const tsA = argv[2];
    const tsB = argv[3];
    if (!rel || !tsA || !tsB) usage();
    const n = normalizeRepoRel(rel);
    if (!isVersionedPath(n)) {
      console.error(`Path not in versioned scope: ${n}`);
      process.exit(1);
    }
    const out = diffVersions({ repoRoot, relPath: n, tsA, tsB });
    process.stdout.write(out);
    return;
  }

  if (argv[0] === '--diff-current') {
    const rel = argv[1];
    if (!rel) usage();
    const n = normalizeRepoRel(rel);
    if (!isVersionedPath(n)) {
      console.error(`Path not in versioned scope: ${n}`);
      process.exit(1);
    }
    let ts = argv[2];
    if (!ts) {
      const entries = await listVersions({ repoRoot, relPath: n });
      if (entries.length === 0) {
        console.error('No snapshots for this path.');
        process.exit(1);
      }
      ts = entries[0]!.safeTs;
    }
    const out = await diffCurrentVsSnapshot(repoRoot, n, ts);
    process.stdout.write(out);
    return;
  }

  if (argv[0] === '--restore') {
    const rel = argv[1];
    const ts = argv[2];
    if (!rel || !ts) usage();
    const n = normalizeRepoRel(rel);
    if (!isVersionedPath(n)) {
      console.error(`Path not in versioned scope: ${n}`);
      process.exit(1);
    }
    const r = await restoreVersion({
      repoRoot,
      relPath: n,
      ts,
      source: 'manual:snap-cli',
    });
    if (!r.ok) {
      console.error(r.error);
      process.exit(1);
    }
    console.log(`Restored ${n} from ${ts}`);
    return;
  }

  for (const raw of argv) {
    const n = normalizeRepoRel(raw);
    if (!isVersionedPath(n)) {
      console.error(`Skip (not in versioned scope): ${n}`);
      process.exit(1);
    }
    const abs = path.join(repoRoot, ...n.split('/'));
    try {
      await access(abs);
    } catch {
      console.error(`File does not exist: ${n}`);
      process.exit(1);
    }
    const res = await snapshotBeforeWrite({
      repoRoot,
      relPath: n,
      source: 'manual:snap-cli',
      action: 'snapshot',
    });
    if (!res.ok) {
      console.error(`Snapshot failed (${n}): ${res.error}`);
      process.exit(1);
    }
    if (res.skipped) {
      console.error(`Unexpected skip for existing file: ${n}`);
      process.exit(1);
    }
    console.log(`Snapshot OK: ${n} -> ${res.snapshotFile}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
