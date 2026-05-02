import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

async function loadFreshEnv() {
  vi.resetModules();
  return (await import('../env.ts')).env;
}

describe('env.PI_INTEGRATION', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to package mode when unset', async () => {
    vi.stubEnv('PI_INTEGRATION', '');
    const env = await loadFreshEnv();
    expect(env.PI_INTEGRATION).toEqual({ mode: 'package' });
  });

  it('reads `legacy` literal as legacy', async () => {
    vi.stubEnv('PI_INTEGRATION', 'legacy');
    const env = await loadFreshEnv();
    expect(env.PI_INTEGRATION.mode).toBe('legacy');
  });

  it('reads `package` as full package mode without type filter', async () => {
    vi.stubEnv('PI_INTEGRATION', 'package');
    const env = await loadFreshEnv();
    const flag = env.PI_INTEGRATION;
    expect(flag.mode).toBe('package');
    expect(flag.types).toBeUndefined();
  });

  it('parses package:design,evaluation as a per-session-type filter', async () => {
    vi.stubEnv('PI_INTEGRATION', 'package:design,evaluation');
    const env = await loadFreshEnv();
    const flag = env.PI_INTEGRATION;
    expect(flag.mode).toBe('package');
    expect(flag.types).toBeDefined();
    expect(flag.types?.has('design')).toBe(true);
    expect(flag.types?.has('evaluation')).toBe(true);
    expect(flag.types?.has('incubation')).toBe(false);
  });

  it('falls back to package on garbage values', async () => {
    vi.stubEnv('PI_INTEGRATION', 'lolwut');
    const env = await loadFreshEnv();
    expect(env.PI_INTEGRATION.mode).toBe('package');
  });

  it('strips whitespace and empty entries from the per-type list', async () => {
    vi.stubEnv('PI_INTEGRATION', 'package: design , , evaluation ');
    const env = await loadFreshEnv();
    const flag = env.PI_INTEGRATION;
    expect(flag.mode).toBe('package');
    expect([...(flag.types ?? [])].sort()).toEqual(['design', 'evaluation']);
  });
});
