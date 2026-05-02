import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const legacyMock = vi.fn();
const packageMock = vi.fn();

vi.mock('../services/pi-agent-service.ts', () => ({
  runDesignAgentSession: legacyMock,
}));
vi.mock('../services/pi-package-adapter.ts', () => ({
  runDesignAgentSessionViaPackage: packageMock,
}));

async function loadFreshRuntime() {
  vi.resetModules();
  return await import('../services/agent-runtime.ts');
}

const baseParams = {
  systemPrompt: '',
  userPrompt: '',
  providerId: 'openrouter',
  modelId: 'm',
  sessionType: 'design',
} as const;

describe('runDesignAgentSession dispatch', () => {
  beforeEach(() => {
    legacyMock.mockReset().mockResolvedValue(null);
    packageMock.mockReset().mockResolvedValue(null);
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('routes to the legacy path by default', async () => {
    vi.stubEnv('PI_INTEGRATION', '');
    const { runDesignAgentSession } = await loadFreshRuntime();
    await runDesignAgentSession({ ...baseParams }, () => {});
    expect(legacyMock).toHaveBeenCalledTimes(1);
    expect(packageMock).not.toHaveBeenCalled();
  });

  it('routes to the package adapter when PI_INTEGRATION=package', async () => {
    vi.stubEnv('PI_INTEGRATION', 'package');
    const { runDesignAgentSession } = await loadFreshRuntime();
    await runDesignAgentSession({ ...baseParams }, () => {});
    expect(packageMock).toHaveBeenCalledTimes(1);
    expect(legacyMock).not.toHaveBeenCalled();
  });

  it('routes specific session types to the package when PI_INTEGRATION=package:design', async () => {
    vi.stubEnv('PI_INTEGRATION', 'package:design');
    const { runDesignAgentSession } = await loadFreshRuntime();
    await runDesignAgentSession({ ...baseParams, sessionType: 'design' }, () => {});
    expect(packageMock).toHaveBeenCalledTimes(1);

    await runDesignAgentSession({ ...baseParams, sessionType: 'evaluation' }, () => {});
    expect(legacyMock).toHaveBeenCalledTimes(1);
    expect(packageMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to legacy for session types not listed in package: filter', async () => {
    vi.stubEnv('PI_INTEGRATION', 'package:incubation');
    const { runDesignAgentSession } = await loadFreshRuntime();
    await runDesignAgentSession({ ...baseParams, sessionType: 'design' }, () => {});
    expect(legacyMock).toHaveBeenCalledTimes(1);
    expect(packageMock).not.toHaveBeenCalled();
  });

  it('routes non-design session types via the same dispatcher (e.g. evaluation, incubation)', async () => {
    vi.stubEnv('PI_INTEGRATION', 'package:evaluation,incubation,inputs-gen,design-system,internal-context');
    const { runDesignAgentSession } = await loadFreshRuntime();
    for (const t of ['evaluation', 'incubation', 'inputs-gen', 'design-system', 'internal-context'] as const) {
      packageMock.mockClear();
      legacyMock.mockClear();
      await runDesignAgentSession({ ...baseParams, sessionType: t }, () => {});
      expect(packageMock).toHaveBeenCalledTimes(1);
      expect(legacyMock).not.toHaveBeenCalled();
    }
  });
});
