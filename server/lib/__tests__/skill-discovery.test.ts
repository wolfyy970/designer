import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildUseSkillToolDescription,
  catalogEntriesToSummaries,
  discoverSkills,
  formatSkillsCatalogXml,
  resolveSkillsRoot,
  splitSkillMarkdown,
} from '../skill-discovery.ts';
import { skillFrontmatterSchema } from '../skill-schema.ts';
import type { SkillCatalogEntry } from '../skill-schema.ts';

describe('splitSkillMarkdown', () => {
  it('parses frontmatter and body', () => {
    const raw = `---
name: X
description: Y
---
Hello **body**`;
    const s = splitSkillMarkdown(raw);
    expect(s?.body.trim()).toBe('Hello **body**');
  });

  it('returns null without opening ---', () => {
    expect(splitSkillMarkdown('no frontmatter')).toBeNull();
  });
});

describe('discoverSkills', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-skills-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('discovers valid packages and ignores bad dirs', async () => {
    await fs.mkdir(path.join(tmp, 'good'), { recursive: true });
    await fs.writeFile(
      path.join(tmp, 'good', 'SKILL.md'),
      `---
name: Good
description: Ok
tags: [x]
when: auto
---
Hi`,
      'utf8',
    );
    await fs.mkdir(path.join(tmp, 'bad'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'bad', 'SKILL.md'), 'no frontmatter', 'utf8');
    const out = await discoverSkills(tmp);
    expect(out).toHaveLength(1);
    expect(out[0]!.key).toBe('good');
    expect(out[0]!.bodyMarkdown.trim()).toBe('Hi');
  });

  it('warns in dev and omits packages with invalid YAML frontmatter', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await fs.mkdir(path.join(tmp, 'bad-yaml'), { recursive: true });
    await fs.writeFile(
      path.join(tmp, 'bad-yaml', 'SKILL.md'),
      `---
name: [ broken
---
body`,
      'utf8',
    );
    const out = await discoverSkills(tmp);
    expect(out).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('all checked-in skills have loadable frontmatter', async () => {
    const skillsRoot = path.resolve(process.cwd(), 'skills');
    const names = await fs.readdir(skillsRoot);
    const expected: string[] = [];
    for (const name of names) {
      if (name.startsWith('_') || name.startsWith('.')) continue;
      try {
        const stat = await fs.stat(path.join(skillsRoot, name, 'SKILL.md'));
        if (stat.isFile()) expected.push(name);
      } catch {
        // Non-skill files such as README.md are expected in this directory.
      }
    }

    const out = await discoverSkills(skillsRoot);
    expect(out.map((s) => s.key)).toEqual(expected.sort());
    expect(out.every((s) => s.bodyMarkdown.trim().startsWith('# '))).toBe(true);
  });
});

describe('formatSkillsCatalogXml', () => {
  it('returns empty string for no skills', () => {
    expect(formatSkillsCatalogXml([])).toBe('');
  });

  it('includes Load guidance and skill keys (no sandbox paths)', () => {
    const xml = formatSkillsCatalogXml([
      { key: 'a', name: 'A', description: 'Alpha' },
      { key: 'b', name: 'B', description: 'Beta' },
    ]);
    expect(xml).toContain('Load');
    expect(xml).toContain('key="a"');
    expect(xml).toContain('key="b"');
    expect(xml).not.toContain('path=');
  });

  it('buildUseSkillToolDescription wraps catalog for Pi tool', () => {
    const desc = buildUseSkillToolDescription([
      { key: 'x', name: 'X', description: 'Xd' },
    ]);
    expect(desc).toContain('use_skill:');
    expect(desc).toContain('<available_skills>');
    expect(desc).toContain('Xd');
  });
});

describe('skillFrontmatterSchema', () => {
  it('accepts valid frontmatter with all fields', () => {
    const r = skillFrontmatterSchema.safeParse({
      name: 'Test',
      description: 'A desc',
      tags: ['a', 'b'],
      when: 'always',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.when).toBe('always');
      expect(r.data.tags).toEqual(['a', 'b']);
    }
  });

  it('defaults tags to [] and when to auto', () => {
    const r = skillFrontmatterSchema.safeParse({ name: 'X', description: 'Y' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tags).toEqual([]);
      expect(r.data.when).toBe('auto');
    }
  });

  it('rejects missing name', () => {
    expect(skillFrontmatterSchema.safeParse({ description: 'Y' }).success).toBe(false);
  });

  it('rejects missing description', () => {
    expect(skillFrontmatterSchema.safeParse({ name: 'X' }).success).toBe(false);
  });

  it('rejects descriptions over Codex loader limits', () => {
    expect(
      skillFrontmatterSchema.safeParse({
        name: 'X',
        description: 'x'.repeat(1025),
      }).success,
    ).toBe(false);
  });

  it('rejects invalid when value', () => {
    expect(
      skillFrontmatterSchema.safeParse({ name: 'X', description: 'Y', when: 'never' }).success,
    ).toBe(false);
  });
});

describe('catalog skills (when !== manual)', () => {
  const entries: SkillCatalogEntry[] = [
    { key: 'a', dir: '/a', name: 'A', description: 'A', tags: [], when: 'auto', bodyMarkdown: '' },
    { key: 'b', dir: '/b', name: 'B', description: 'B', tags: [], when: 'always', bodyMarkdown: '' },
    { key: 'c', dir: '/c', name: 'C', description: 'C', tags: [], when: 'manual', bodyMarkdown: '' },
  ];

  it('excludes manual skills from session catalog lists', () => {
    const result = entries.filter((e) => e.when !== 'manual');
    expect(result.map((e) => e.key)).toEqual(['a', 'b']);
  });
});

describe('catalogEntriesToSummaries', () => {
  it('extracts key, name, description', () => {
    const entries: SkillCatalogEntry[] = [
      { key: 'x', dir: '/x', name: 'X', description: 'XD', tags: ['t'], when: 'auto', bodyMarkdown: 'body' },
    ];
    expect(catalogEntriesToSummaries(entries)).toEqual([
      { key: 'x', name: 'X', description: 'XD' },
    ]);
  });
});

describe('resolveSkillsRoot', () => {
  it('uses explicit path when provided', () => {
    const result = resolveSkillsRoot('/custom/skills');
    expect(result).toBe('/custom/skills');
  });

  it('defaults to cwd/skills when no override', () => {
    const original = process.env.SKILLS_ROOT;
    delete process.env.SKILLS_ROOT;
    try {
      const result = resolveSkillsRoot();
      expect(result).toBe(path.resolve(process.cwd(), 'skills'));
    } finally {
      if (original !== undefined) process.env.SKILLS_ROOT = original;
    }
  });
});
