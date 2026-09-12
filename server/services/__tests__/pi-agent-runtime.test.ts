import { describe, it, expect, vi } from 'vitest';
import { mapPackageResult, STREAM_IDLE_LIMIT_MS } from '../pi-agent-runtime.ts';
import type { SessionRunResult } from '@auto-designer/pi';

vi.mock('../provider-model-context.ts', () => ({
  getProviderModelContextWindow: vi.fn(),
}));

function makeResult(over: Partial<SessionRunResult> = {}): SessionRunResult {
  return {
    files: {},
    todos: [],
    emittedFilePaths: [],
    aborted: false,
    ...over,
  } as SessionRunResult;
}

describe('mapPackageResult', () => {
  it('returns ok when there are output files (no seed)', () => {
    const out = mapPackageResult(makeResult({ files: { 'index.html': '<html/>' } }), undefined);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.files).toEqual({ 'index.html': '<html/>' });
  });

  it('returns ok when revision round adds at least one file beyond seed', () => {
    const out = mapPackageResult(
      makeResult({ files: { 'index.html': '<html/>', 'styles.css': 'body{}' } }),
      { 'index.html': '<html/>' },
    );
    expect(out.ok).toBe(true);
  });

  it('returns no_files when nothing was written and not aborted', () => {
    const out = mapPackageResult(makeResult({ files: {} }), undefined);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('no_files');
      expect(out.message).toMatch(/Agent completed without creating design files/u);
    }
  });

  it('returns no_files when revision wrote only files identical to seed', () => {
    const out = mapPackageResult(
      makeResult({ files: { 'index.html': '<html/>' } }),
      { 'index.html': '<html/>' },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no_files');
  });

  it('treats an aborted empty run as ok (not a no_files error)', () => {
    const out = mapPackageResult(makeResult({ aborted: true, files: {} }), undefined);
    expect(out.ok).toBe(true);
  });
});

describe('resolveProviderConfig', () => {
  it('throws synchronously on unsupported provider id', async () => {
    const { resolveProviderConfig } = await import('../pi-agent-runtime.ts');
    await expect(resolveProviderConfig('anthropic', 'm')).rejects.toThrow(/unsupported provider/u);
  });

  it('builds an openrouter config with /api/v1 base url', async () => {
    const { getProviderModelContextWindow } = await import('../provider-model-context.ts');
    vi.mocked(getProviderModelContextWindow).mockResolvedValueOnce(undefined);
    const { resolveProviderConfig } = await import('../pi-agent-runtime.ts');
    const out = await resolveProviderConfig('openrouter', 'minimax/minimax-m2.5');
    expect(out.provider.id).toBe('openrouter');
    expect(out.provider.baseUrl).toMatch(/\/api\/v1$/u);
    expect(out.contextWindow).toBeGreaterThan(0);
  });

  it('uses the registry context window when one is available', async () => {
    const { getProviderModelContextWindow } = await import('../provider-model-context.ts');
    vi.mocked(getProviderModelContextWindow).mockResolvedValueOnce(262_144);
    const { resolveProviderConfig } = await import('../pi-agent-runtime.ts');
    const out = await resolveProviderConfig('openrouter', 'foo/bar');
    expect(out.contextWindow).toBe(262_144);
  });
});

describe('stream-idle watchdog threshold', () => {
  it('stays above the p99 turn latency of the pinned default model', () => {
    // Measured against `deepseek/deepseek-v4.1-flash` on OpenRouter: single
    // turns of 45.6s / 36.9s / 55.5s producing 10k+ completion tokens. At the
    // old 45s the watchdog aborted healthy builds mid-flight, and an aborted
    // build leaves a partial artifact (HTML referencing styles.css/app.js that
    // were never written) which renders as a broken-looking design.
    expect(STREAM_IDLE_LIMIT_MS).toBeGreaterThanOrEqual(90_000);
  });

  it('stays well inside the 800s serverless function limit', () => {
    // Too generous is also a failure mode: the abort must fire while the
    // request is still alive, otherwise the user gets a bare timeout instead
    // of an explanatory error.
    expect(STREAM_IDLE_LIMIT_MS).toBeLessThanOrEqual(300_000);
  });
});
