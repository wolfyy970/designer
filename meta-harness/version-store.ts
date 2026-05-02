/**
 * Shadow version store for the @auto-designer/pi package's skills + prompt
 * templates and the rubric weights.
 *
 * - Package skills (`packages/auto-designer-pi/skills/<key>/SKILL.md`) snapshot
 *   to `packages/auto-designer-pi/skills/<key>/_versions/<timestamp>.md`.
 * - Package prompt templates (`packages/auto-designer-pi/prompts/<name>.md`)
 *   snapshot to `packages/auto-designer-pi/prompts/_versions/<name>/<timestamp>.md`
 *   — kept in a single `_versions/` dir since prompts are flat files. Pi's
 *   prompt loader does NOT recurse, so `_versions/` is invisible to it.
 * - Rubric weights (`src/lib/rubric-weights.json`) snapshot to the legacy
 *   `.prompt-versions/snapshots/...` location to preserve history continuity.
 *
 * Manifest: `.prompt-versions/manifest.jsonl`.
 */
import { existsSync } from 'node:fs';
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
  /** Repo-relative path to the snapshot file (forward slashes). */
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

export type SnapAllResult = {
  saved: string[];
  unchanged: string[];
  missing: string[];
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

/** Old layout: `.prompt-versions/snapshots/<path segments>/` */
export function legacySnapshotDirForRelPath(repoRoot: string, relPath: string): string {
  const norm = normalizeRelPath(relPath);
  const segs = norm.split('/').filter(Boolean);
  return path.join(repoRoot, VERSION_STORE_DIR, SNAPSHOTS_SUBDIR, ...segs);
}

/**
 * Directory holding timestamped snapshot files for this versioned path.
 * Package skills → `packages/auto-designer-pi/skills/<key>/_versions/`;
 * package prompts → `packages/auto-designer-pi/prompts/_versions/<name>/`;
 * rubric → legacy `.prompt-versions/snapshots/...`.
 */
export function snapshotDirForRelPath(repoRoot: string, relPath: string): string {
  const norm = normalizeRelPath(relPath);
  if (norm === 'src/lib/rubric-weights.json') {
    return legacySnapshotDirForRelPath(repoRoot, norm);
  }
  const skillMatch = /^packages\/auto-designer-pi\/skills\/([^/]+)\/SKILL\.md$/u.exec(norm);
  if (skillMatch) {
    return path.join(
      repoRoot,
      'packages',
      'auto-designer-pi',
      'skills',
      skillMatch[1]!,
      '_versions',
    );
  }
  const promptMatch = /^packages\/auto-designer-pi\/prompts\/([^/]+)\.md$/u.exec(norm);
  if (promptMatch) {
    return path.join(
      repoRoot,
      'packages',
      'auto-designer-pi',
      'prompts',
      '_versions',
      promptMatch[1]!,
    );
  }
  return legacySnapshotDirForRelPath(repoRoot, norm);
}

function manifestPath(repoRoot: string): string {
  return path.join(repoRoot, VERSION_STORE_DIR, MANIFEST_FILE);
}

function repoRelativePath(repoRoot: string, absFile: string): string {
  return path.relative(repoRoot, absFile).split(path.sep).join('/');
}

async function readSnapshotDirIntoEntries(
  snapshotDir: string,
  ext: string,
  repoRoot: string,
): Promise<VersionEntry[]> {
  let names: string[];
  try {
    names = await readdir(snapshotDir);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return [];
    throw e;
  }
  const files = names.filter((n) => n.endsWith(ext));
  const entries: VersionEntry[] = [];
  for (const name of files) {
    const safeTs = name.slice(0, -ext.length);
    const abs = path.join(snapshotDir, name);
    const body = await readFile(abs, 'utf8');
    entries.push({
      ts: safeTsToIsoGuess(safeTs),
      safeTs,
      snapshotFile: repoRelativePath(repoRoot, abs),
      hash: computeHash(body),
    });
  }
  return entries;
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

  const safeTsBase = toSafeTimestamp(new Date());
  const ext = path.extname(relPath) || '.bin';
  const snapshotDir = snapshotDirForRelPath(opts.repoRoot, relPath);
  await mkdir(snapshotDir, { recursive: true });
  let counter = 0;
  let baseName: string;
  let absSnap: string;
  for (;;) {
    const stem = counter === 0 ? safeTsBase : `${safeTsBase}-${counter}`;
    baseName = `${stem}${ext}`;
    absSnap = path.join(snapshotDir, baseName);
    if (!existsSync(absSnap)) break;
    counter += 1;
  }
  await writeFile(absSnap, prior, 'utf8');

  const snapRel = repoRelativePath(opts.repoRoot, absSnap);
  const safeTs = baseName.slice(0, -ext.length);
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

  return {
    ok: true,
    skipped: false,
    snapshotFile: snapRel,
    safeTs,
    hash: computeHash(prior),
  };
}

export async function listVersions(opts: ListVersionsOptions): Promise<VersionEntry[]> {
  const relPath = normalizeRelPath(opts.relPath);
  const ext = path.extname(relPath) || '.bin';
  const primaryDir = snapshotDirForRelPath(opts.repoRoot, relPath);
  const legacyDir = legacySnapshotDirForRelPath(opts.repoRoot, relPath);

  const primary = await readSnapshotDirIntoEntries(primaryDir, ext, opts.repoRoot);
  const legacy =
    path.resolve(primaryDir) === path.resolve(legacyDir)
      ? []
      : await readSnapshotDirIntoEntries(legacyDir, ext, opts.repoRoot);

  const merged = new Map<string, VersionEntry>();
  for (const e of legacy) merged.set(e.safeTs, e);
  for (const e of primary) merged.set(e.safeTs, e);
  const arr = [...merged.values()];
  arr.sort((a, b) => b.safeTs.localeCompare(a.safeTs));
  return arr;
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
  const baseName = `${safeTs}${ext}`;
  const primary = path.join(snapshotDirForRelPath(repoRoot, norm), baseName);
  if (existsSync(primary)) return primary;
  const legacy = path.join(legacySnapshotDirForRelPath(repoRoot, norm), baseName);
  if (existsSync(legacy)) return legacy;
  return primary;
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

/** All repo-backed versioned files that exist on disk: package skills, package prompts, rubric JSON. */
export async function enumerateVersionedFiles(repoRoot: string): Promise<string[]> {
  const out: string[] = [];

  // Package skills: packages/auto-designer-pi/skills/<key>/SKILL.md
  const pkgSkillsRoot = path.join(repoRoot, 'packages', 'auto-designer-pi', 'skills');
  try {
    const names = await readdir(pkgSkillsRoot);
    for (const name of names) {
      if (name.startsWith('_') || name.startsWith('.')) continue;
      const rel = `packages/auto-designer-pi/skills/${name}/SKILL.md`;
      const abs = path.join(pkgSkillsRoot, name, 'SKILL.md');
      try {
        const st = await stat(abs);
        if (st.isFile()) out.push(rel);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no package skills dir */
  }

  // Package prompts: packages/auto-designer-pi/prompts/*.md (top level only — Pi does not recurse).
  // _versions/ subdir holds snapshots and is skipped.
  const pkgPromptsRoot = path.join(repoRoot, 'packages', 'auto-designer-pi', 'prompts');
  try {
    const names = await readdir(pkgPromptsRoot);
    for (const name of names) {
      if (name.startsWith('_versions')) continue;
      if (!name.endsWith('.md')) continue;
      const rel = `packages/auto-designer-pi/prompts/${name}`;
      const abs = path.join(pkgPromptsRoot, name);
      try {
        const st = await stat(abs);
        if (st.isFile()) out.push(rel);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no package prompts dir */
  }

  // Rubric weights stay at their existing path; snapshot directory remains the legacy location.
  const fixed = ['src/lib/rubric-weights.json'] as const;
  for (const rel of fixed) {
    try {
      const st = await stat(path.join(repoRoot, ...rel.split('/')));
      if (st.isFile()) out.push(rel);
    } catch {
      /* missing */
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/**
 * Snapshot every versioned file whose content hash differs from the newest snapshot (or has no snapshot).
 */
export async function snapAll(repoRoot: string, source: string): Promise<SnapAllResult> {
  const paths = await enumerateVersionedFiles(repoRoot);
  const saved: string[] = [];
  const unchanged: string[] = [];
  const missing: string[] = [];

  for (const relPath of paths) {
    const absWork = path.join(repoRoot, ...relPath.split('/'));
    let content: string;
    try {
      const st = await stat(absWork);
      if (!st.isFile()) {
        missing.push(relPath);
        continue;
      }
      content = await readFile(absWork, 'utf8');
    } catch {
      missing.push(relPath);
      continue;
    }
    const h = computeHash(content);
    const entries = await listVersions({ repoRoot, relPath });
    if (entries.length > 0 && entries[0]!.hash === h) {
      unchanged.push(relPath);
      continue;
    }
    const r = await snapshotBeforeWrite({
      repoRoot,
      relPath,
      source,
      action: 'snapshot',
    });
    if (!r.ok) {
      missing.push(relPath);
      continue;
    }
    if (r.skipped) {
      unchanged.push(relPath);
      continue;
    }
    saved.push(relPath);
  }
  return { saved, unchanged, missing };
}
