import { describe, it, expect, vi } from 'vitest';

import { buildAgenticSystemContext } from '../build-agentic-system-context.ts';

describe('buildAgenticSystemContext', () => {
  it('omits sandbox AGENTS.md when sandboxAgentsContext is empty or whitespace', async () => {
    const getPromptBody = vi.fn(async (key: string) => {
      if (key === 'genSystemHtmlAgentic') return 'BASE';
      if (key === 'sandboxAgentsContext') return '  \n  ';
      return '';
    });

    const out = await buildAgenticSystemContext({ getPromptBody });

    expect(out.sandboxSeedFiles).toEqual({});
    expect(out.systemPrompt).toBe('BASE');
  });

  it('seeds AGENTS.md from trimmed sandboxAgentsContext when non-empty', async () => {
    const getPromptBody = vi.fn(async (key: string) => {
      if (key === 'genSystemHtmlAgentic') return 'BASE';
      if (key === 'sandboxAgentsContext') return '  hello agent  ';
      return '';
    });

    const out = await buildAgenticSystemContext({ getPromptBody });

    expect(out.sandboxSeedFiles).toEqual({ 'AGENTS.md': 'hello agent' });
  });

  it('uses genSystemHtmlAgentic body only as system prompt (no skill catalog)', async () => {
    const getPromptBody = vi.fn(async (key: string) => {
      if (key === 'genSystemHtmlAgentic') return 'BASE';
      if (key === 'sandboxAgentsContext') return '';
      return '';
    });

    const out = await buildAgenticSystemContext({ getPromptBody });

    expect(out.systemPrompt).toBe('BASE');
  });
});
