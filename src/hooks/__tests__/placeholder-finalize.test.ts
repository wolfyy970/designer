import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GENERATION_STATUS } from '../../constants/generation';
import { createPlaceholderFinalizeAfterStream } from '../placeholder-finalize';
import {
  createInitialPlaceholderSessionState,
  type PlaceholderRafBatchers,
} from '../placeholder-session-state';
import type { CompiledPrompt } from '../../types/compiler';

vi.mock('../../storage', () => ({
  storage: {
    saveCode: vi.fn(),
    saveFiles: vi.fn(),
    saveRoundFiles: vi.fn(),
    saveProvenance: vi.fn(),
  },
}));

vi.mock('../../stores/generation-store', () => ({
  useGenerationStore: {
    getState: () => ({ results: [] }),
  },
}));

import { storage } from '../../storage';

const prompt = {
  id: 'cp1',
  strategyId: 'vs1',
  specId: 's1',
  prompt: 'p',
  images: [],
  compiledAt: 't',
} satisfies CompiledPrompt;

const noopBatch = {
  cancelOnly: () => {},
  flushPending: () => {},
};
const noopRaf = {
  activity: noopBatch,
  thinking: noopBatch,
  code: noopBatch,
  streamingTool: noopBatch,
} satisfies PlaceholderRafBatchers;

describe('createPlaceholderFinalizeAfterStream', () => {
  beforeEach(() => {
    vi.mocked(storage.saveCode).mockReset();
    vi.mocked(storage.saveFiles).mockReset();
    vi.mocked(storage.saveRoundFiles).mockReset();
    vi.mocked(storage.saveProvenance).mockReset();
  });

  it('surfaces which persistence step failed on saveCode', async () => {
    vi.mocked(storage.saveCode).mockRejectedValue(new Error('quota'));

    const state = createInitialPlaceholderSessionState();
    state.generatedCode = '<html></html>';

    const updateResult = vi.fn();
    const onResultComplete = vi.fn();
    const finalize = createPlaceholderFinalizeAfterStream({
      placeholderId: 'ph1',
      prompt,
      providerId: 'openrouter',
      model: 'm',
      state,
      updateResult,
      flushAllPendingTraces: vi.fn().mockResolvedValue(undefined),
      raf: noopRaf,
      onResultComplete,
    });

    await finalize();

    expect(onResultComplete).toHaveBeenCalledWith('ph1');
    expect(storage.saveCode).toHaveBeenCalledWith('ph1', '<html></html>');
    expect(storage.saveFiles).not.toHaveBeenCalled();
    expect(updateResult).toHaveBeenCalledWith(
      'ph1',
      expect.objectContaining({
        status: GENERATION_STATUS.ERROR,
        error: expect.stringMatching(/saveCode:.*quota/),
      }),
    );
  });
});
