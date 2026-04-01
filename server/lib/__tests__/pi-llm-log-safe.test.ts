import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../log-store.ts', () => ({
  logLlmCall: vi.fn(),
}));

import { logLlmCall } from '../../log-store.ts';
import { safeLogLlmCall } from '../pi-llm-log.ts';

describe('safeLogLlmCall', () => {
  beforeEach(() => {
    vi.mocked(logLlmCall).mockReset();
  });

  it('does not throw when logLlmCall throws', () => {
    vi.mocked(logLlmCall).mockImplementation(() => {
      throw new Error('log store failure');
    });
    expect(() =>
      safeLogLlmCall({
        source: 'builder',
        model: 'm',
        provider: 'openrouter',
        systemPrompt: 's',
        userPrompt: 'u',
        response: '',
        durationMs: 1,
      }),
    ).not.toThrow();
  });

  it('delegates to logLlmCall on success', () => {
    safeLogLlmCall({
      source: 'builder',
      model: 'm',
      provider: 'openrouter',
      systemPrompt: 's',
      userPrompt: 'u',
      response: 'ok',
      durationMs: 2,
    });
    expect(logLlmCall).toHaveBeenCalledTimes(1);
  });
});
