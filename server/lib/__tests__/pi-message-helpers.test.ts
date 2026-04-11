import { describe, expect, it } from 'vitest';
import { findLastAssistantMessage } from '../pi-message-helpers.ts';

describe('findLastAssistantMessage', () => {
  it('returns undefined for empty messages', () => {
    expect(findLastAssistantMessage([])).toBeUndefined();
  });

  it('returns the last assistant message from mixed roles', () => {
    const last = findLastAssistantMessage([
      { role: 'user', content: 'hi' },
      { role: 'assistant', stopReason: 'stop', content: 'a' },
      { role: 'user', content: 'again' },
      { role: 'assistant', stopReason: 'error', errorMessage: 'upstream' },
    ]);
    expect(last?.stopReason).toBe('error');
    expect(last?.errorMessage).toBe('upstream');
  });

  it('ignores non-objects in the array', () => {
    expect(
      findLastAssistantMessage([null, 'x', { role: 'assistant', stopReason: 'stop' }] as unknown[]),
    ).toMatchObject({ stopReason: 'stop' });
  });
});
