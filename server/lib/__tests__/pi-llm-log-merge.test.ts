import { describe, expect, it } from 'vitest';
import { mergeStreamedAndFormattedAssistantResponse } from '../merge-streamed-formatted-assistant.ts';

describe('mergeStreamedAndFormattedAssistantResponse', () => {
  it('keeps streamed body when it is longer than formatted', () => {
    const streamed = 'a'.repeat(100);
    const formatted = 'short';
    expect(mergeStreamedAndFormattedAssistantResponse(streamed, formatted)).toBe(streamed);
  });

  it('uses formatted when it is longer', () => {
    const streamed = 'hi';
    const formatted = '[tool_call write_file path=src/App.tsx]\n' + 'b'.repeat(50);
    expect(mergeStreamedAndFormattedAssistantResponse(streamed, formatted)).toBe(formatted);
  });

  it('prefers formatted on tie so structured tool lines win', () => {
    const x = 'same-length-12345';
    expect(mergeStreamedAndFormattedAssistantResponse(x, x)).toBe(x);
  });
});
