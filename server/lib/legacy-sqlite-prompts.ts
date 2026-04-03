/**
 * Read latest PromptVersion body per key from a legacy Prisma SQLite DB (pre–Langfuse migration).
 * Requires Node.js ≥ 22.5 (`node:sqlite`). Returns {} if the file/table is missing or SQLite is unavailable.
 *
 * “Latest” = highest `version` per `promptKey`, tie-break by highest `id` (matches Prisma ordering if duplicates exist).
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env.ts';
import type { PromptKey } from './prompts/defaults.ts';
import { PROMPT_KEYS } from './prompts/defaults.ts';

const KEY_SET = new Set<string>(PROMPT_KEYS);

/** Max rows / DB size guardrails (prompt bodies can be large). */
const MAX_ROWS = 64;
const MAX_DB_BYTES = 256 * 1024 * 1024;

/** Prisma SQLite URLs are `file:./relative.db` or `file:/abs.db` (optional `?` query). */
export function sqliteFilePathFromPrismaDatabaseUrl(databaseUrl: string, cwd: string): string | null {
  const trimmed = databaseUrl.trim();
  if (!trimmed.startsWith('file:')) return null;
  let rest = trimmed.slice('file:'.length);
  const q = rest.indexOf('?');
  if (q !== -1) rest = rest.slice(0, q);
  if (rest.startsWith('//') && !rest.startsWith('///')) {
    rest = rest.slice(2);
  }
  if (!path.isAbsolute(rest)) {
    rest = path.join(cwd, rest);
  }
  return path.normalize(rest);
}

export async function readLatestPromptBodiesFromLegacySqlite(
  absolutePath: string,
): Promise<Partial<Record<PromptKey, string>>> {
  if (!fs.existsSync(absolutePath)) return {};
  const st = fs.statSync(absolutePath);
  if (!st.isFile() || st.size === 0 || st.size > MAX_DB_BYTES) return {};

  let DatabaseSync: typeof import('node:sqlite').DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    return {};
  }

  let db: InstanceType<typeof DatabaseSync>;
  try {
    db = new DatabaseSync(absolutePath, { readOnly: true, enableForeignKeyConstraints: false });
  } catch {
    return {};
  }

  try {
    const table = db
      .prepare(
        `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'PromptVersion' LIMIT 1`,
      )
      .get() as { ok: number } | undefined;
    if (!table) return {};

    const rows = db
      .prepare(
        `SELECT promptKey, body FROM (
           SELECT
             "promptKey" AS promptKey,
             body AS body,
             ROW_NUMBER() OVER (
               PARTITION BY "promptKey"
               ORDER BY version DESC, id DESC
             ) AS rn
           FROM "PromptVersion"
         ) WHERE rn = 1`,
      )
      .all() as { promptKey: string; body: string }[];

    if (rows.length > MAX_ROWS) return {};

    const out: Partial<Record<PromptKey, string>> = {};
    for (const row of rows) {
      if (!row.promptKey || typeof row.body !== 'string') continue;
      if (!KEY_SET.has(row.promptKey)) continue;
      out[row.promptKey as PromptKey] = row.body;
    }
    return out;
  } catch {
    return {};
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

function uniqueResolvedPaths(cwd: string, paths: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (!p) continue;
    const abs = path.isAbsolute(p) ? p : path.join(cwd, p);
    const key = path.resolve(abs);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Resolve legacy DB: `LANGFUSE_PROMPT_IMPORT_SQLITE` (only path attempted when set), else try, in order,
 * `DATABASE_URL` when it is a `file:` SQLite path, then `prisma/dev.db`. First file with non-empty
 * `PromptVersion` wins.
 */
export async function loadLegacyPromptBodiesForSeed(cwd: string): Promise<{
  bodies: Partial<Record<PromptKey, string>>;
  sourceLabel: string;
}> {
  const explicit = env.LANGFUSE_PROMPT_IMPORT_SQLITE;
  if (explicit) {
    const abs = path.isAbsolute(explicit) ? explicit : path.join(cwd, explicit);
    const bodies = await readLatestPromptBodiesFromLegacySqlite(abs);
    return { bodies, sourceLabel: path.resolve(abs) };
  }

  const fromUrl = sqliteFilePathFromPrismaDatabaseUrl(env.DATABASE_URL, cwd);
  const tryPaths = uniqueResolvedPaths(cwd, [fromUrl, path.join(cwd, 'prisma', 'dev.db')]);

  for (const abs of tryPaths) {
    const bodies = await readLatestPromptBodiesFromLegacySqlite(abs);
    if (Object.keys(bodies).length > 0) {
      return { bodies, sourceLabel: abs };
    }
  }
  return { bodies: {}, sourceLabel: '' };
}
