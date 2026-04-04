import { describe, it, expect, vi, beforeEach } from 'vitest';

const promptCreate = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());
const getMock = vi.hoisted(() => vi.fn());

vi.mock('../langfuse-app-client.ts', () => ({
  isLangfuseAppConfigured: () => true,
  getLangfuseAppClient: () => ({
    api: {
      prompts: {
        list: listMock,
        get: getMock,
      },
    },
    prompt: { create: promptCreate },
  }),
}));

vi.mock('../legacy-sqlite-prompts.ts', () => ({
  loadLegacyPromptBodiesForSeed: vi
    .fn()
    .mockResolvedValue({ bodies: {}, sourceLabel: null as string | null }),
}));

import { seedLangfusePromptsFromDefaults } from '../langfuse-seed-prompts.ts';
import { PROMPT_KEYS } from '../../../src/lib/prompts/defaults.ts';

describe('seedLangfusePromptsFromDefaults', () => {
  beforeEach(() => {
    promptCreate.mockClear();
    listMock.mockReset();
    getMock.mockReset();
  });

  it('creates every key when no Langfuse versions exist (bootstrap)', async () => {
    listMock.mockResolvedValue({ data: [{ versions: [] }] });

    await seedLangfusePromptsFromDefaults({ sync: false });

    expect(promptCreate).toHaveBeenCalledTimes(PROMPT_KEYS.length);
  });

  it('does not overwrite when labeled body drifts and sync is false', async () => {
    listMock.mockResolvedValue({ data: [{ versions: [1] }] });
    getMock.mockResolvedValue({ type: 'text', prompt: '__drift_not_in_repo_defaults__' });

    await seedLangfusePromptsFromDefaults({ sync: false });

    expect(promptCreate).not.toHaveBeenCalled();
  });

  it('pushes target body when labeled body drifts and sync is true', async () => {
    listMock.mockResolvedValue({ data: [{ versions: [1] }] });
    getMock.mockResolvedValue({ type: 'text', prompt: '__drift_not_in_repo_defaults__' });

    await seedLangfusePromptsFromDefaults({ sync: true });

    expect(promptCreate).toHaveBeenCalledTimes(PROMPT_KEYS.length);
  });
});
