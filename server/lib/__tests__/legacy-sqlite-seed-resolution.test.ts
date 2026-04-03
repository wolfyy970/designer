import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const sqliteMod = await import('node:sqlite').catch(() => null);

/**
 * `loadLegacyPromptBodiesForSeed` reads `env` from `server/env.ts` at module load.
 * Use dynamic imports after `vi.stubEnv` + `vi.resetModules()` so tests see stubbed `process.env`.
 */
describe.skipIf(!sqliteMod)('loadLegacyPromptBodiesForSeed', () => {
  const { DatabaseSync } = sqliteMod!;

  const dir = mkdtempSync(join(tmpdir(), 'ad-legacy-seed-'));
  const dbPath = join(dir, 'seed.db');

  beforeAll(() => {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE "PromptVersion" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "promptKey" TEXT NOT NULL,
        "version" INTEGER NOT NULL,
        "body" TEXT NOT NULL
      );
    `);
    db.prepare(`INSERT INTO "PromptVersion" ("promptKey", version, body) VALUES (?, ?, ?)`).run(
      'compilerSystem',
      1,
      'seed-from-legacy-db',
    );
    db.close();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('prefers LANGFUSE_PROMPT_IMPORT_SQLITE when set', async () => {
    vi.stubEnv('LANGFUSE_PROMPT_IMPORT_SQLITE', dbPath);
    vi.stubEnv('DATABASE_URL', '');
    vi.resetModules();
    const { loadLegacyPromptBodiesForSeed } = await import('../legacy-sqlite-prompts.ts');
    const out = await loadLegacyPromptBodiesForSeed(dir);
    expect(out.bodies.compilerSystem).toBe('seed-from-legacy-db');
    expect(out.sourceLabel).toBeDefined();
  });

  it('falls back to DATABASE_URL when it is a file: SQLite path', async () => {
    vi.stubEnv('LANGFUSE_PROMPT_IMPORT_SQLITE', '');
    vi.stubEnv('DATABASE_URL', `file:${dbPath}`);
    vi.resetModules();
    const { loadLegacyPromptBodiesForSeed } = await import('../legacy-sqlite-prompts.ts');
    const out = await loadLegacyPromptBodiesForSeed(dir);
    expect(out.bodies.compilerSystem).toBe('seed-from-legacy-db');
  });

  it('returns empty bodies when no legacy source is configured', async () => {
    vi.stubEnv('LANGFUSE_PROMPT_IMPORT_SQLITE', '');
    vi.stubEnv('DATABASE_URL', '');
    vi.resetModules();
    const { loadLegacyPromptBodiesForSeed } = await import('../legacy-sqlite-prompts.ts');
    const out = await loadLegacyPromptBodiesForSeed(dir);
    expect(out.bodies).toEqual({});
    expect(out.sourceLabel).toBe('');
  });
});
