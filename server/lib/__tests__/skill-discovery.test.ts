import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildSkillSandboxSeedMap,
  catalogEntriesToSummaries,
  discoverSkills,
  filterSkillsForCatalog,
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
});

describe('formatSkillsCatalogXml', () => {
  it('returns empty string for no skills', () => {
    expect(formatSkillsCatalogXml([])).toBe('');
  });

  it('includes read guidance and path attributes', () => {
    const xml = formatSkillsCatalogXml([
      { key: 'a', name: 'A', description: 'Alpha', path: 'skills/a/SKILL.md' },
      { key: 'b', name: 'B', description: 'Beta', path: 'skills/b/SKILL.md' },
    ]);
    expect(xml).toContain('read');
    expect(xml).toContain('path="skills/a/SKILL.md"');
    expect(xml).toContain('path="skills/b/SKILL.md"');
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

  it('rejects invalid when value', () => {
    expect(
      skillFrontmatterSchema.safeParse({ name: 'X', description: 'Y', when: 'never' }).success,
    ).toBe(false);
  });
});

describe('filterSkillsForCatalog', () => {
  const entries: SkillCatalogEntry[] = [
    { key: 'a', dir: '/a', name: 'A', description: 'A', tags: [], when: 'auto', bodyMarkdown: '' },
    { key: 'b', dir: '/b', name: 'B', description: 'B', tags: [], when: 'always', bodyMarkdown: '' },
    { key: 'c', dir: '/c', name: 'C', description: 'C', tags: [], when: 'manual', bodyMarkdown: '' },
  ];

  it('excludes manual skills', () => {
    const result = filterSkillsForCatalog(entries);
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

describe('buildSkillSandboxSeedMap', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-seed-'));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('seeds SKILL.md body and eligible reference files', async () => {
    const dir = path.join(tmp, 'my-skill');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), '---\nname: S\ndescription: D\n---\nBody');
    await fs.writeFile(path.join(dir, 'example.html'), '<h1>Hi</h1>');
    await fs.writeFile(path.join(dir, 'data.bin'), Buffer.from([0x00, 0x01]));

    const entry: SkillCatalogEntry = {
      key: 'my-skill', dir, name: 'S', description: 'D', tags: [], when: 'auto', bodyMarkdown: 'Body',
    };
    const seed = await buildSkillSandboxSeedMap([entry]);
    expect(seed['skills/my-skill/SKILL.md']).toBe('Body');
    expect(seed['skills/my-skill/example.html']).toBe('<h1>Hi</h1>');
    expect(seed).not.toHaveProperty('skills/my-skill/data.bin');
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
