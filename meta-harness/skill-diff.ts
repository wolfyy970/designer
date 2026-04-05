/**
 * Compare `skills-snapshot/` trees vs live `skills/` for promotion + preflight.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** Recursively list relative file paths under dir (posix-style slashes). */
async function walkFiles(absDir: string, relPrefix = ''): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = path.join(relPrefix, e.name);
    const full = path.join(absDir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walkFiles(full, rel)));
    } else if (e.isFile()) {
      out.push(rel.split(path.sep).join('/'));
    }
  }
  return out.sort();
}

async function readBinary(p: string): Promise<Buffer | null> {
  try {
    return await readFile(p);
  } catch {
    return null;
  }
}

type SkillTreeDiff = {
  added: string[];
  deleted: string[];
  modified: Array<{ relPath: string; snapshotBytes: number; liveBytes: number }>;
  unchanged: number;
};

export async function diffSkillTrees(snapshotRoot: string, liveRoot: string): Promise<SkillTreeDiff> {
  const snapPaths = new Set(await walkFiles(snapshotRoot));
  const livePaths = new Set(await walkFiles(liveRoot));

  const added: string[] = [];
  const deleted: string[] = [];
  const modified: Array<{ relPath: string; snapshotBytes: number; liveBytes: number }> = [];
  let unchanged = 0;

  for (const rel of snapPaths) {
    if (!livePaths.has(rel)) {
      deleted.push(rel);
      continue;
    }
    const a = await readBinary(path.join(snapshotRoot, rel));
    const b = await readBinary(path.join(liveRoot, rel));
    if (!a || !b) continue;
    if (Buffer.compare(a, b) === 0) unchanged += 1;
    else modified.push({ relPath: rel, snapshotBytes: a.length, liveBytes: b.length });
  }
  for (const rel of livePaths) {
    if (!snapPaths.has(rel)) added.push(rel);
  }
  return { added, deleted, modified, unchanged };
}

/** True if directory exists. */
export async function pathIsDir(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}
