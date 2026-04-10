/**
 * CLI for the prompt/skill/rubric version store (.prompt-versions/).
 * Run from repo root: pnpm version-snapshot …
 */
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  diffCurrentVsSnapshot,
  diffVersions,
  listVersions,
  restoreVersion,
  snapshotBeforeWrite,
} from '../meta-harness/version-store.ts';

function usage(): never {
  console.error(`Usage:
  pnpm version-snapshot <repo-relative-path> [<path> …]     snapshot current file(s) before manual edit
  pnpm version-snapshot --list <path>                       list saved versions (newest first)
  pnpm version-snapshot --diff <path> <safeTsA> <safeTsB>   unified diff between two snapshots
  pnpm version-snapshot --diff-current <path> [safeTs]     diff snapshot vs working file (default: latest)
  pnpm version-snapshot --restore <path> <safeTs>           restore working file from snapshot
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

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) usage();

  const repoRoot = process.cwd();

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
      source: 'manual:version-snapshot-cli',
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
    if (!(await fileExists(abs))) {
      console.error(`File does not exist: ${n}`);
      process.exit(1);
    }
    const res = await snapshotBeforeWrite({
      repoRoot,
      relPath: n,
      source: 'manual:version-snapshot-cli',
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
