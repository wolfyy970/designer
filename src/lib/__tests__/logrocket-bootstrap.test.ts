/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const initMock = vi.fn();
const setupReactMock = vi.fn();

vi.mock('logrocket', () => ({
  default: { init: initMock },
}));

vi.mock('logrocket-react', () => ({
  default: setupReactMock,
}));

async function loadFresh() {
  vi.resetModules();
  return import('../logrocket-bootstrap');
}

describe('logrocket-bootstrap', () => {
  beforeEach(() => {
    initMock.mockReset();
    setupReactMock.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('isLogRocketActive() is false before init', async () => {
    vi.stubEnv('VITE_LOGROCKET_APP_ID', '');
    vi.stubEnv('PROD', false);
    const mod = await loadFresh();
    expect(mod.isLogRocketActive()).toBe(false);
  });

  it('does not init in dev when VITE_LOGROCKET_APP_ID is unset', async () => {
    vi.stubEnv('VITE_LOGROCKET_APP_ID', '');
    vi.stubEnv('PROD', false);
    const mod = await loadFresh();
    mod.initLogRocket();
    expect(initMock).not.toHaveBeenCalled();
    expect(setupReactMock).not.toHaveBeenCalled();
    expect(mod.isLogRocketActive()).toBe(false);
  });

  it('uses production default app id when env var is empty and PROD is true', async () => {
    vi.stubEnv('VITE_LOGROCKET_APP_ID', '');
    vi.stubEnv('PROD', true);
    const mod = await loadFresh();
    mod.initLogRocket();
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock.mock.calls[0]?.[0]).toBe('qbwhsc/designer-6dify');
    expect(setupReactMock).toHaveBeenCalledTimes(1);
    expect(mod.isLogRocketActive()).toBe(true);
  });

  it('overrides the default with VITE_LOGROCKET_APP_ID when set (trimmed)', async () => {
    vi.stubEnv('VITE_LOGROCKET_APP_ID', '  org/custom-app  ');
    vi.stubEnv('PROD', true);
    const mod = await loadFresh();
    mod.initLogRocket();
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock.mock.calls[0]?.[0]).toBe('org/custom-app');
  });

  it('passes release option from VITE_APP_VERSION when present', async () => {
    vi.stubEnv('VITE_LOGROCKET_APP_ID', 'org/app');
    vi.stubEnv('VITE_APP_VERSION', '1.2.3');
    const mod = await loadFresh();
    mod.initLogRocket();
    const opts = initMock.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(opts?.release).toBe('1.2.3');
    expect(opts?.mergeIframes).toBe(true);
  });

  it('omits release when VITE_APP_VERSION is empty', async () => {
    vi.stubEnv('VITE_LOGROCKET_APP_ID', 'org/app');
    vi.stubEnv('VITE_APP_VERSION', '');
    const mod = await loadFresh();
    mod.initLogRocket();
    const opts = initMock.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(opts).not.toHaveProperty('release');
  });

  it('is idempotent across repeat calls', async () => {
    vi.stubEnv('VITE_LOGROCKET_APP_ID', 'org/app');
    const mod = await loadFresh();
    mod.initLogRocket();
    mod.initLogRocket();
    mod.initLogRocket();
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(setupReactMock).toHaveBeenCalledTimes(1);
  });
});
