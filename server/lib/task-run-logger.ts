/**
 * Lightweight filesystem bundle for Pi task sessions (incubate, inputs-gen, design-system extract).
 * Gated by env.OBSERVABILITY_LOG_BASE_DIR (same as NDJSON / eval-run logs).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SessionType } from './skill-discovery.ts';

export async function writeTaskRunDiskLog(input: {
  baseDir: string;
  correlationId: string;
  sessionType: SessionType;
  providerId: string;
  modelId: string;
  userPrompt: string;
  resultFile: string;
  resultContent: string;
  sandboxFilePaths: string[];
  skillKeys: string[];
  durationMs: number;
  outcome: 'success' | 'error' | 'no_result';
  errorMessage?: string;
}): Promise<void> {
  const root = path.join(input.baseDir, 'task-runs', input.correlationId);
  await mkdir(root, { recursive: true });

  const meta = {
    correlationId: input.correlationId,
    sessionType: input.sessionType,
    providerId: input.providerId,
    modelId: input.modelId,
    durationMs: input.durationMs,
    outcome: input.outcome,
    resultFile: input.resultFile,
    sandboxFileCount: input.sandboxFilePaths.length,
    errorMessage: input.errorMessage,
  };
  await writeFile(path.join(root, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  await writeFile(path.join(root, 'user-prompt.txt'), input.userPrompt, 'utf8');
  await writeFile(path.join(root, 'result.json'), input.resultContent, 'utf8');
  await writeFile(
    path.join(root, 'skills.json'),
    `${JSON.stringify({ keys: input.skillKeys }, null, 2)}\n`,
    'utf8',
  );
}
