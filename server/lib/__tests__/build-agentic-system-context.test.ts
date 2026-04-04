import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildAgenticSystemContext } from '../build-agentic-system-context.ts';

describe('buildAgenticSystemContext', () => {
  async function emptySkillsRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'ad-ctx-empty-skills-'));
  }

  it('omits sandbox AGENTS.md when sandboxAgentsContext is empty or whitespace', async () => {
    const skillsRoot = await emptySkillsRoot();
    try {
      const getPromptBody = vi.fn(async (key: string) => {
        if (key === 'genSystemHtmlAgentic') return 'BASE';
        if (key === 'sandboxAgentsContext') return '  \n  ';
        return '';
      });

      const out = await buildAgenticSystemContext({ getPromptBody, skillsRoot });

      expect(out.loadedSkills).toEqual([]);
      expect(out.skillCatalog).toEqual([]);
      expect(out.sandboxSeedFiles).toEqual({});
      expect(out.systemPrompt).toBe('BASE');
    } finally {
      await fs.rm(skillsRoot, { recursive: true, force: true });
    }
  });

  it('seeds AGENTS.md from trimmed sandboxAgentsContext when non-empty', async () => {
    const skillsRoot = await emptySkillsRoot();
    try {
      const getPromptBody = vi.fn(async (key: string) => {
        if (key === 'genSystemHtmlAgentic') return 'BASE';
        if (key === 'sandboxAgentsContext') return '  hello agent  ';
        return '';
      });

      const out = await buildAgenticSystemContext({ getPromptBody, skillsRoot });

      expect(out.loadedSkills).toEqual([]);
      expect(out.skillCatalog).toEqual([]);
      expect(out.sandboxSeedFiles).toEqual({ 'AGENTS.md': 'hello agent' });
    } finally {
      await fs.rm(skillsRoot, { recursive: true, force: true });
    }
  });

  it('uses genSystemHtmlAgentic body only as system prompt (no skill catalog)', async () => {
    const skillsRoot = await emptySkillsRoot();
    try {
      const getPromptBody = vi.fn(async (key: string) => {
        if (key === 'genSystemHtmlAgentic') return 'BASE';
        if (key === 'sandboxAgentsContext') return '';
        return '';
      });

      const out = await buildAgenticSystemContext({ getPromptBody, skillsRoot });

      expect(out.loadedSkills).toEqual([]);
      expect(out.skillCatalog).toEqual([]);
      expect(out.systemPrompt).toBe('BASE');
      expect(out.systemPrompt).not.toContain('<available_skills>');
    } finally {
      await fs.rm(skillsRoot, { recursive: true, force: true });
    }
  });

  it('returns skillCatalog + seeds for when:always skills (catalog not in system prompt)', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-ctx-skills-'));
    try {
      const key = 'always-on';
      await fs.mkdir(path.join(tmp, key), { recursive: true });
      await fs.writeFile(
        path.join(tmp, key, 'SKILL.md'),
        `---
name: Always on
description: Constant helper
when: always
---
Skill body`,
        'utf8',
      );
      const getPromptBody = vi.fn(async (key: string) => {
        if (key === 'genSystemHtmlAgentic') return 'BASE';
        if (key === 'sandboxAgentsContext') return '';
        return '';
      });
      const out = await buildAgenticSystemContext({ getPromptBody, skillsRoot: tmp });
      expect(out.loadedSkills).toHaveLength(1);
      expect(out.loadedSkills[0]!.key).toBe(key);
      expect(out.skillCatalog).toHaveLength(1);
      expect(out.skillCatalog[0]!.key).toBe(key);
      expect(out.skillCatalog[0]!.bodyMarkdown.trim()).toBe('Skill body');
      expect(out.systemPrompt).toBe('BASE');
      expect(out.systemPrompt).not.toContain('<available_skills>');
      expect(out.sandboxSeedFiles[`skills/${key}/SKILL.md`]).toBe('Skill body');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('pre-seeds when:auto skills in the sandbox like other catalog entries', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-ctx-skills-auto-'));
    try {
      const key = 'on-demand';
      await fs.mkdir(path.join(tmp, key), { recursive: true });
      await fs.writeFile(
        path.join(tmp, key, 'SKILL.md'),
        `---
name: On demand
description: Optional helper
when: auto
---
Body`,
        'utf8',
      );
      const getPromptBody = vi.fn(async (key: string) => {
        if (key === 'genSystemHtmlAgentic') return 'BASE';
        if (key === 'sandboxAgentsContext') return '';
        return '';
      });
      const out = await buildAgenticSystemContext({ getPromptBody, skillsRoot: tmp });
      expect(out.loadedSkills).toHaveLength(1);
      expect(out.skillCatalog).toHaveLength(1);
      expect(out.systemPrompt).not.toContain('<available_skills>');
      expect(out.sandboxSeedFiles[`skills/${key}/SKILL.md`]).toBe('Body');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
