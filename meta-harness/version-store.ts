/**
 * Shadow version store for skills, designer system prompt, and rubric weights.
 * Artifacts live under repo-root `.prompt-versions/` (committed).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const VERSION_STORE_DIR = '.prompt-versions';
export const SNAPSHOTS_SUBDIR = 'snapshots';
export const MANIFEST_FILE = 'manifest.jsonl';

export type SnapshotAction = 'update' | 'delete' | 'snapshot';

export type SnapshotBeforeWriteOptions = {
  repoRoot: string;
  /** Repo-relative path with forward slashes (e.g. skills/foo/SKILL.md). */
  relPath: string;
  source: string;
  /** Default `update`. Use `delete` before removing a file; `snapshot` for manual-only backup. */
  action?: SnapshotAction;
};

export type SnapshotResult =
  | { ok: true; skipped: true; reason: 'missing_file' }
  | { ok: true; skipped: false; snapshotFile: string; safeTs: string; hash: string }
  | { ok: false; error: string };

export type VersionEntry = {
  /** ISO timestamp from manifest when available; else derived from filename. */
  ts: string;
  /** Filesystem-safe id (filename stem) for CLI `--diff` / `--restore`. */
  safeTs: string;
  /** Relative to `.prompt-versions/`. */
  snapshotFile: string;
  hash: string;
};

export type ListVersionsOptions = {
  repoRoot: string;
  relPath: string;
};

export type DiffVersionsByTsOptions = {
  repoRoot: string;
  relPath: string;
  tsA: string;
  tsB: string;
};

export type DiffFilesOptions = {
  fileA: string;
  fileB: string;
};

export type RestoreVersionOptions = {
  repoRoot: string;
  relPath: string;
  /** Same id as printed by `listVersions` / `--list` (safe timestamp stem). */
  ts: string;
  source?: string;
};

function normalizeRelPath(relPath: string): string {
  return relPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

/** ISO instant to a single filesystem component (no path separators). */
export function toSafeTimestamp(d: Date): string {
  return d
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\./g, '-');
}

export function computeHash(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

export function snapshotDirForRelPath(repoRoot: string, relPath: string): string {
  const norm = normalizeRelPath(relPath);
  const segs = norm.split('/').filter(Boolean);
  return path.join(repoRoot, VERSION_STORE_DIR, SNAPSHOTS_SUBDIR, ...segs);
}

function manifestPath(repoRoot: string): string {
  return path.join(repoRoot, VERSION_STORE_DIR, MANIFEST_FILE);
}

function posixSnapshotRel(snapshotDir: string, repoRoot: string, baseName: string): string {
  const abs = path.join(snapshotDir, baseName);
  const rel = path.relative(path.join(repoRoot, VERSION_STORE_DIR), abs);
  return rel.split(path.sep).join('/');
}

export async function snapshotBeforeWrite(opts: SnapshotBeforeWriteOptions): Promise<SnapshotResult> {
  const relPath = normalizeRelPath(opts.relPath);
  const action: SnapshotAction = opts.action ?? 'update';
  const absWork = path.join(opts.repoRoot, ...relPath.split('/'));

  let prior: string;
  try {
    const st = await stat(absWork);
    if (!st.isFile()) {
      return { ok: false, error: `Not a regular file: ${relPath}` };
    }
    prior = await readFile(absWork, 'utf8');
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      if (action === 'snapshot') {
        return { ok: false, error: `Cannot snapshot missing file: ${relPath}` };
      }
      return { ok: true, skipped: true, reason: 'missing_file' };
    }
    return { ok: false, error: String(e) };
  }

  const safeTs = toSafeTimestamp(new Date());
  const ext = path.extname(relPath) || '.bin';
  const snapshotDir = snapshotDirForRelPath(opts.repoRoot, relPath);
  await mkdir(snapshotDir, { recursive: true });
  const baseName = `${safeTs}${ext}`;
  const absSnap = path.join(snapshotDir, baseName);
  await writeFile(absSnap, prior, 'utf8');

  const snapRel = posixSnapshotRel(snapshotDir, opts.repoRoot, baseName);
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    path: relPath,
    action,
    source: opts.source,
    snapshotFile: snapRel,
    hash: computeHash(prior),
  });

  await mkdir(path.dirname(manifestPath(opts.repoRoot)), { recursive: true });
  await appendFile(manifestPath(opts.repoRoot), `${line}\n`, 'utf8');

  return { ok: true, skipped: false, snapshotFile: snapRel, safeTs, hash: computeHash(prior) };
}

export async function listVersions(opts: ListVersionsOptions): Promise<VersionEntry[]> {
  const relPath = normalizeRelPath(opts.relPath);
  const snapshotDir = snapshotDirForRelPath(opts.repoRoot, relPath);
  let names: string[];
  try {
    names = await readdir(snapshotDir);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return [];
    throw e;
  }

  const ext = path.extname(relPath) || '.bin';
  const files = names.filter((n) => n.endsWith(ext));
  files.sort((a, b) => b.localeCompare(a));

  const entries: VersionEntry[] = [];
  for (const name of files) {
    const safeTs = name.slice(0, -ext.length);
    const abs = path.join(snapshotDir, name);
    const body = await readFile(abs, 'utf8');
    entries.push({
      ts: safeTsToIsoGuess(safeTs),
      safeTs,
      snapshotFile: posixSnapshotRel(snapshotDir, opts.repoRoot, name),
      hash: computeHash(body),
    });
  }
  return entries;
}

/** Best-effort ISO string from safe filename stem for display. */
function safeTsToIsoGuess(safeTs: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)-(\d{3})Z$/u.exec(safeTs);
  if (!m) return safeTs;
  const [, day, hh, mm, ss, fracPart] = m;
  const frac = fracPart!.padStart(3, '0');
  return `${day}T${hh}:${mm}:${ss}.${frac}Z`;
}

export function diffVersions(opts: DiffVersionsByTsOptions | DiffFilesOptions): string {
  const fileA = 'fileA' in opts ? opts.fileA : snapshotFileAbs(opts.repoRoot, opts.relPath, opts.tsA);
  const fileB = 'fileB' in opts ? opts.fileB : snapshotFileAbs(opts.repoRoot, opts.relPath, opts.tsB);
  try {
    return execFileSync('git', ['diff', '--no-index', '--', fileA, fileB], {
      encoding: 'utf8',
      maxBuffer: 10_000_000,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string };
    if (err.status === 1 && typeof err.stdout === 'string') return err.stdout;
    throw e;
  }
}

function snapshotFileAbs(repoRoot: string, relPath: string, safeTs: string): string {
  const norm = normalizeRelPath(relPath);
  const ext = path.extname(norm) || '.bin';
  const snapshotDir = snapshotDirForRelPath(repoRoot, norm);
  return path.join(snapshotDir, `${safeTs}${ext}`);
}

export async function restoreVersion(opts: RestoreVersionOptions): Promise<{ ok: true } | { ok: false; error: string }> {
  const relPath = normalizeRelPath(opts.relPath);
  const source = opts.source ?? 'meta-harness:version-store:restore';
  const absSnap = snapshotFileAbs(opts.repoRoot, relPath, opts.ts);
  try {
    await stat(absSnap);
  } catch {
    return { ok: false, error: `Snapshot not found for ts=${opts.ts}: ${relPath}` };
  }

  const snapContent = await readFile(absSnap, 'utf8');
  const absWork = path.join(opts.repoRoot, ...relPath.split('/'));

  try {
    const st = await stat(absWork);
    if (st.isFile()) {
      const pre = await snapshotBeforeWrite({ repoRoot: opts.repoRoot, relPath, source, action: 'snapshot' });
      if (!pre.ok) return { ok: false, error: pre.error };
    }
  } catch {
    /* target missing: nothing to back up */
  }

  await mkdir(path.dirname(absWork), { recursive: true });
  await writeFile(absWork, snapContent, 'utf8');
  return { ok: true };
}

/** Diff one snapshot vs the current working tree file. */
export async function diffCurrentVsSnapshot(
  repoRoot: string,
  relPath: string,
  safeTs: string,
): Promise<string> {
  const absSnap = snapshotFileAbs(repoRoot, relPath, safeTs);
  const absWork = path.join(repoRoot, ...normalizeRelPath(relPath).split('/'));
  return diffVersions({ fileA: absSnap, fileB: absWork });
}
