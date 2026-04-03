import { describe, it, expect, vi, beforeEach } from 'vitest';

const listLatestSkillVersions = vi.hoisted(() => vi.fn());
const buildVirtualSkillFiles = vi.hoisted(() => vi.fn());
const selectSkillsForContext = vi.hoisted(() => vi.fn());
const formatSkillsForPrompt = vi.hoisted(() => vi.fn());

vi.mock('../../db/skills.ts', () => ({
  listLatestSkillVersions,
  buildVirtualSkillFiles,
}));

vi.mock('../skills/select-skills.ts', () => ({
  selectSkillsForContext,
}));

vi.mock('../skills/format-for-prompt.ts', () => ({
  formatSkillsForPrompt,
}));

import { buildAgenticSystemContext } from '../build-agentic-system-context.ts';

describe('buildAgenticSystemContext', () => {
  beforeEach(() => {
    listLatestSkillVersions.mockReset();
    buildVirtualSkillFiles.mockReset();
    selectSkillsForContext.mockReset();
    formatSkillsForPrompt.mockReset();

    listLatestSkillVersions.mockResolvedValue([]);
    selectSkillsForContext.mockReturnValue([]);
    formatSkillsForPrompt.mockReturnValue('');
  });

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

  it('appends skill catalog to system prompt when formatSkillsForPrompt returns text', async () => {
    formatSkillsForPrompt.mockReturnValue('<catalog>');
    const getPromptBody = vi.fn(async (key: string) => {
      if (key === 'genSystemHtmlAgentic') return 'BASE';
      if (key === 'sandboxAgentsContext') return '';
      return '';
    });

    const out = await buildAgenticSystemContext({ getPromptBody });

    expect(out.systemPrompt).toBe('BASE\n<catalog>');
  });
});
