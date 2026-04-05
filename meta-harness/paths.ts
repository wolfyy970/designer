import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root (directory containing package.json). */
export function repoRoot(): string {
  return path.resolve(__dirname, '..');
}

export function resolveEvalRunsBaseDir(configEvalRunsBaseDir: string | undefined): string {
  const trimmed = (configEvalRunsBaseDir ?? '').trim();
  if (trimmed) return path.isAbsolute(trimmed) ? trimmed : path.join(repoRoot(), trimmed);
  const env =
    (process.env.OBSERVABILITY_LOG_DIR ?? '').trim() || (process.env.LLM_LOG_DIR ?? '').trim();
  if (env) return env;
  return path.join(repoRoot(), 'logs', 'observability');
}
