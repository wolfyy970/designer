import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildAgenticSystemContext } from '../build-agentic-system-context.ts';

vi.mock('../prompt-discovery.ts', () => ({
  getSystemPromptBody: vi.fn(async () => 'BASE'),
}));

describe('buildAgenticSystemContext', () => {
  async function emptySkillsRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'ad-ctx-empty-skills-'));
  }

  it('returns empty catalog and empty sandbox seeds when no skills exist', async () => {
    const skillsRoot = await emptySkillsRoot();
    try {
      const out = await buildAgenticSystemContext({ skillsRoot });

      expect(out.loadedSkills).toEqual([]);
      expect(out.skillCatalog).toEqual([]);
      expect(out.systemPrompt).toBe('BASE');
      expect(out.sandboxSeedFiles).toEqual({});
    } finally {
      await fs.rm(skillsRoot, { recursive: true, force: true });
    }
  });

  it('returns skillCatalog but does not copy skills into sandboxSeedFiles', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-ctx-skills-'));
    try {
      const key = 'test-design-skill';
      await fs.mkdir(path.join(tmp, key), { recursive: true });
      await fs.writeFile(
        path.join(tmp, key, 'SKILL.md'),
        `---
name: Test Design Skill
description: A test skill
tags:
  - design
when: auto
---
Skill body`,
        'utf8',
      );
      const out = await buildAgenticSystemContext({ skillsRoot: tmp, sessionType: 'design' });
      expect(out.loadedSkills).toHaveLength(1);
      expect(out.loadedSkills[0]!.key).toBe(key);
      expect(out.skillCatalog).toHaveLength(1);
      expect(out.sandboxSeedFiles).toEqual({});
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('filters skills by session type tags', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-ctx-filter-'));
    try {
      await fs.mkdir(path.join(tmp, 'design-skill'), { recursive: true });
      await fs.writeFile(
        path.join(tmp, 'design-skill', 'SKILL.md'),
        `---
name: Design Skill
description: For design
tags:
  - design
when: auto
---
Design body`,
        'utf8',
      );
      await fs.mkdir(path.join(tmp, 'eval-skill'), { recursive: true });
      await fs.writeFile(
        path.join(tmp, 'eval-skill', 'SKILL.md'),
        `---
name: Eval Skill
description: For evaluation
tags:
  - evaluation
when: auto
---
Eval body`,
        'utf8',
      );
      const designOut = await buildAgenticSystemContext({ skillsRoot: tmp, sessionType: 'design' });
      expect(designOut.skillCatalog).toHaveLength(1);
      expect(designOut.skillCatalog[0]!.key).toBe('design-skill');

      const evalOut = await buildAgenticSystemContext({ skillsRoot: tmp, sessionType: 'evaluation' });
      expect(evalOut.skillCatalog).toHaveLength(1);
      expect(evalOut.skillCatalog[0]!.key).toBe('eval-skill');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
