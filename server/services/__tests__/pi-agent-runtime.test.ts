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
  /**
   * Measured builder per-turn durations from three real builds with the pinned
   * default (`deepseek/deepseek-v4.1-flash`), in seconds:
   *
   *   45.6 55.5 36.9 28.4 35.9 23.7 ... 81.5 63.7 109.9
   *
   * The original 45s aborted healthy builds. 120s cleared the 55s samples but
   * sat under the 109.9s one, so a slightly slower turn was still killed — and
   * an aborted build leaves a partial artifact that renders unstyled, which is
   * the "broken preview" the user reported.
   */
  const SLOWEST_OBSERVED_TURN_MS = 109_900;

  it('clears the slowest observed turn with real headroom', () => {
    // Not just "greater than" — a threshold 10% above the worst sample is how
    // the previous value passed while still aborting real runs.
    expect(STREAM_IDLE_LIMIT_MS).toBeGreaterThanOrEqual(SLOWEST_OBSERVED_TURN_MS * 1.5);
  });

  it('still fires inside the 800s serverless function limit', () => {
    // Too generous is also a failure mode: the abort must happen while the
    // request is alive, or the user gets a bare timeout instead of a message.
    expect(STREAM_IDLE_LIMIT_MS).toBeLessThanOrEqual(400_000);
  });
});
