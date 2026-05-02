import { describe, it, expect } from 'vitest';
import type { Context } from '@auto-designer/pi';
import { piContextToLogFields } from '../pi-llm-log.ts';

describe('piContextToLogFields', () => {
  it('joins system prompt and message history', () => {
    const context: Context = {
      systemPrompt: 'You are an agent',
      messages: [
        { role: 'user', content: 'Hi', timestamp: 1 },
        {
          role: 'toolResult',
          toolCallId: 'c1',
          toolName: 'read_file',
          content: [{ type: 'text', text: 'contents' }],
          isError: false,
          timestamp: 2,
        },
      ],
    };
    const { systemPrompt, userPrompt } = piContextToLogFields(context);
    expect(systemPrompt).toBe('You are an agent');
    expect(userPrompt).toContain('Hi');
    expect(userPrompt).toContain('[tool_result read_file]');
    expect(userPrompt).toContain('contents');
  });
});
