/**
 * `findLastAssistantMessage` is the single source of truth for "did this run
 * fail?" — consumed by both the event bridge (run outcome) and the host's
 * upstream-retry loop. It was previously duplicated in both files; these tests
 * pin the behaviour they must now share.
 */
import { describe, expect, it } from 'vitest';

import { findLastAssistantMessage } from '../src/internal/pi-messages.ts';

describe('findLastAssistantMessage', () => {
  it('returns the assistant turn and its stop reason', () => {
    expect(
      findLastAssistantMessage([
        { role: 'user' },
        { role: 'assistant', stopReason: 'error', errorMessage: 'upstream 500' },
      ]),
    ).toEqual({ role: 'assistant', stopReason: 'error', errorMessage: 'upstream 500' });
  });

  it('scans backwards past non-assistant turns', () => {
    // Pi appends a tool-result message after an assistant turn that errored.
    // Checking only the final element would report a clean run.
    expect(
      findLastAssistantMessage([
        { role: 'assistant', stopReason: 'error', errorMessage: 'rate limited' },
        { role: 'toolResult' },
      ])?.errorMessage,
    ).toBe('rate limited');
  });

  it('returns the most recent assistant turn when several exist', () => {
    expect(
      findLastAssistantMessage([
        { role: 'assistant', stopReason: 'stop' },
        { role: 'user' },
        { role: 'assistant', stopReason: 'aborted' },
      ])?.stopReason,
    ).toBe('aborted');
  });

  it('is permissive about untyped input rather than throwing', () => {
    for (const input of [undefined, null, 'nope', 42, {}, []]) {
      expect(findLastAssistantMessage(input)).toBeUndefined();
    }
  });

  it('skips malformed entries without stopping the scan', () => {
    expect(
      findLastAssistantMessage([{ role: 'assistant', stopReason: 'error' }, null, 'junk', 7])
        ?.stopReason,
    ).toBe('error');
  });

  it('does not treat a non-assistant-only array as a failure', () => {
    expect(findLastAssistantMessage([{ role: 'user' }, { role: 'toolResult' }])).toBeUndefined();
  });
});
