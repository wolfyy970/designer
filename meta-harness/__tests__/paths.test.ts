/**
 * resolveEvalRunsBaseDir — runner vs server log directory alignment.
 */
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repoRoot, resolveEvalRunsBaseDir } from '../paths.ts';

describe('resolveEvalRunsBaseDir', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to repo logs/observability when config and env are empty', () => {
    vi.stubEnv('OBSERVABILITY_LOG_DIR', '');
    vi.stubEnv('LLM_LOG_DIR', '');
    const resolved = resolveEvalRunsBaseDir('');
    expect(resolved).toBe(path.join(repoRoot(), 'logs', 'observability'));
  });

  it('prefers OBSERVABILITY_LOG_DIR over LLM_LOG_DIR', () => {
    vi.stubEnv('OBSERVABILITY_LOG_DIR', '/tmp/obs-a');
    vi.stubEnv('LLM_LOG_DIR', '/tmp/llm-b');
    expect(resolveEvalRunsBaseDir('')).toBe('/tmp/obs-a');
  });

  it('falls back to LLM_LOG_DIR when OBSERVABILITY_LOG_DIR is unset', () => {
    vi.stubEnv('OBSERVABILITY_LOG_DIR', '');
    vi.stubEnv('LLM_LOG_DIR', '/tmp/llm-only');
    expect(resolveEvalRunsBaseDir('')).toBe('/tmp/llm-only');
  });

  it('joins relative config path to repo root', () => {
    vi.stubEnv('OBSERVABILITY_LOG_DIR', '');
    vi.stubEnv('LLM_LOG_DIR', '');
    const resolved = resolveEvalRunsBaseDir('custom/logs');
    expect(resolved).toBe(path.join(repoRoot(), 'custom', 'logs'));
  });

  it('preserves absolute config path', () => {
    vi.stubEnv('OBSERVABILITY_LOG_DIR', '');
    vi.stubEnv('LLM_LOG_DIR', '');
    const abs = path.join(path.sep, 'var', 'tmp', 'eval');
    expect(resolveEvalRunsBaseDir(abs)).toBe(abs);
  });
});
