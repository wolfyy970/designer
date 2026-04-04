import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  readLatestPromptBodiesFromLegacySqlite,
  sqliteFilePathFromPrismaDatabaseUrl,
} from '../legacy-sqlite-prompts.ts';

const sqliteMod = await import('node:sqlite').catch(() => null);

describe('sqliteFilePathFromPrismaDatabaseUrl', () => {
  const cwd = '/app';

  it('resolves relative Prisma file URLs', () => {
    expect(sqliteFilePathFromPrismaDatabaseUrl('file:./prisma/dev.db', cwd)).toBe('/app/prisma/dev.db');
  });

  it('strips connection query params', () => {
    expect(sqliteFilePathFromPrismaDatabaseUrl('file:./db.sqlite?connection_limit=1', cwd)).toBe(
      '/app/db.sqlite',
    );
  });
});

describe.skipIf(!sqliteMod)('readLatestPromptBodiesFromLegacySqlite', () => {
  const { DatabaseSync } = sqliteMod!;

  const dir = mkdtempSync(join(tmpdir(), 'ad-legacy-sqlite-'));
  const dbPath = join(dir, 'legacy.db');

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
      'v1',
    );
    db.prepare(`INSERT INTO "PromptVersion" ("promptKey", version, body) VALUES (?, ?, ?)`).run(
      'compilerSystem',
      2,
      'v2-latest',
    );
    db.prepare(`INSERT INTO "PromptVersion" ("promptKey", version, body) VALUES (?, ?, ?)`).run(
      'variant',
      1,
      'variant-only',
    );
    db.prepare(`INSERT INTO "PromptVersion" ("promptKey", version, body) VALUES (?, ?, ?)`).run(
      'unknownKey',
      1,
      'skip-me',
    );
    db.close();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns latest body per known promptKey and ignores unknown keys', async () => {
    const bodies = await readLatestPromptBodiesFromLegacySqlite(dbPath);
    expect(bodies['hypotheses-generator-system']).toBe('v2-latest');
    expect(bodies['designer-hypothesis-inputs']).toBe('variant-only');
    expect(bodies['incubator-user-inputs']).toBeUndefined();
    expect((bodies as Record<string, string>).unknownKey).toBeUndefined();
  });

  it('returns {} when PromptVersion table is missing', async () => {
    const emptyPath = join(dir, 'empty.db');
    const db = new DatabaseSync(emptyPath);
    db.exec(`CREATE TABLE foo (id INT);`);
    db.close();
    const bodies = await readLatestPromptBodiesFromLegacySqlite(emptyPath);
    expect(bodies).toEqual({});
  });

  it('picks row with higher id when version ties (degenerate data)', async () => {
    const tiePath = join(dir, 'tie.db');
    const db = new DatabaseSync(tiePath);
    db.exec(`
      CREATE TABLE "PromptVersion" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "promptKey" TEXT NOT NULL,
        "version" INTEGER NOT NULL,
        "body" TEXT NOT NULL
      );
    `);
    db.prepare(`INSERT INTO "PromptVersion" ("promptKey", version, body) VALUES (?, ?, ?)`).run(
      'compilerUser',
      5,
      'older-same-version',
    );
    db.prepare(`INSERT INTO "PromptVersion" ("promptKey", version, body) VALUES (?, ?, ?)`).run(
      'compilerUser',
      5,
      'newer-by-id',
    );
    db.close();
    const bodies = await readLatestPromptBodiesFromLegacySqlite(tiePath);
    expect(bodies['incubator-user-inputs']).toBe('newer-by-id');
  });
});
