import { afterEach, describe, expect, it, vi } from 'vitest';
import { debugMetaHarness } from '../debug-log.ts';

describe('debugMetaHarness', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('does not log when VITEST is true', () => {
    vi.stubEnv('VITEST', 'true');
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    debugMetaHarness('label', 'detail');
    expect(spy).not.toHaveBeenCalled();
  });

  it('logs when VITEST is unset', () => {
    vi.stubEnv('VITEST', '');
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    debugMetaHarness('label', 'detail');
    expect(spy).toHaveBeenCalledWith('[meta-harness] label', 'detail');
  });
});
