import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupPreviewSession } from '../preview-session-cleanup';

describe('cleanupPreviewSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deletes preview sessions without surfacing cleanup failures', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchMock);

    expect(() => cleanupPreviewSession('session-1')).not.toThrow();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith('/api/preview/sessions/session-1', { method: 'DELETE' });
    debugSpy.mockRestore();
  });
});
