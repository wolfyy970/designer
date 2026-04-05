/**
 * Session directories, candidate ids, test-case file listing.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MetaHarnessMode } from './modes.ts';
import type { MetaHarnessConfig } from './schemas.ts';
import { ARTIFACT } from './constants.ts';

function newMetaHarnessSessionFolderName(mode: MetaHarnessMode): string {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  return `session-${mode}-${iso}`;
}

export async function createMetaHarnessSession(options: {
  historyRoot: string;
  mode: MetaHarnessMode;
  cfg: MetaHarnessConfig;
  iterations: number;
}): Promise<{ sessionDir: string; sessionFolderName: string }> {
  await mkdir(options.historyRoot, { recursive: true });
  const sessionFolderName = newMetaHarnessSessionFolderName(options.mode);
  const sessionDir = path.join(options.historyRoot, sessionFolderName);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    path.join(sessionDir, ARTIFACT.sessionJson),
    `${JSON.stringify(
      {
        startedAt: new Date().toISOString(),
        mode: options.mode,
        iterations: options.iterations,
        configSnapshot: {
          apiBaseUrl: options.cfg.apiBaseUrl,
          proposerModel: options.cfg.proposerModel,
          compileModel: options.cfg.compileModel,
          compileProvider: options.cfg.compileProvider,
          defaultCompilerProvider: options.cfg.defaultCompilerProvider,
          agenticMaxRevisionRounds: options.cfg.agenticMaxRevisionRounds,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return { sessionDir, sessionFolderName };
}

export async function nextCandidateId(historyDir: string): Promise<number> {
  await mkdir(historyDir, { recursive: true });
  let max = 0;
  const entries = await readdir(historyDir, { withFileTypes: true });
  for (const e of entries) {
    const m = /^candidate-(\d+)$/.exec(e.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export async function listTestCaseFiles(testCasesDir: string): Promise<string[]> {
  await mkdir(testCasesDir, { recursive: true });
  const files = await readdir(testCasesDir);
  return files.filter((f) => f.endsWith('.json')).map((f) => path.join(testCasesDir, f));
}

export async function writeBestCandidate(historyDir: string, candidateId: number, meanScore: number) {
  const p = path.join(historyDir, ARTIFACT.bestCandidateJson);
  await writeFile(
    p,
    `${JSON.stringify({ candidateId, meanScore, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
}
