import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SessionScopedResourceLoader,
  defaultSkillTagLookup,
  parseTagsFromFrontmatter,
  clearSkillTagCache,
} from '../src/resource-loader';
import type { ResourceLoader } from '../src/internal/pi-types';

function fakeBaseLoader(skills: Array<{ name: string; description: string; filePath: string }>): ResourceLoader {
  const skillObjs = skills.map((s) => ({
    name: s.name,
    description: s.description,
    filePath: s.filePath,
    baseDir: '',
    sourceInfo: { type: 'project', path: s.filePath } as never,
    disableModelInvocation: false,
  }));
  return {
    getSkills: () => ({ skills: skillObjs, diagnostics: [] }),
    getExtensions: () =>
      ({ extensions: [], errors: [], runtime: undefined as never } as never),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => undefined,
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}

describe('parseTagsFromFrontmatter', () => {
  it('parses inline list form', () => {
    expect(parseTagsFromFrontmatter('---\nname: x\ntags: [design, evaluation]\n---\nbody')).toEqual([
      'design',
      'evaluation',
    ]);
  });

  it('parses inline list form with quoted entries', () => {
    expect(parseTagsFromFrontmatter('---\ntags: ["a", "b", \'c\']\n---\n')).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('parses block list form', () => {
    expect(
      parseTagsFromFrontmatter('---\nname: x\ntags:\n  - design\n  - evaluation\n---\nbody'),
    ).toEqual(['design', 'evaluation']);
  });

  it('returns empty array when no frontmatter or no tags', () => {
    expect(parseTagsFromFrontmatter('# heading\nno frontmatter')).toEqual([]);
    expect(parseTagsFromFrontmatter('---\nname: x\n---\nbody')).toEqual([]);
  });
});

describe('SessionScopedResourceLoader', () => {
  it('filters skills by session-type tag and passes other accessors through', async () => {
    clearSkillTagCache();
    const tmp = mkdtempSync(join(tmpdir(), 'pi-pkg-skills-'));
    try {
      const designSkill = join(tmp, 'design-skill');
      const evalSkill = join(tmp, 'eval-skill');
      mkdirSync(designSkill);
      mkdirSync(evalSkill);
      const designPath = join(designSkill, 'SKILL.md');
      const evalPath = join(evalSkill, 'SKILL.md');
      writeFileSync(designPath, '---\nname: design-skill\ndescription: x\ntags: [design]\n---\nbody');
      writeFileSync(evalPath, '---\nname: eval-skill\ndescription: y\ntags: [evaluation]\n---\nbody');

      const base = fakeBaseLoader([
        { name: 'design-skill', description: 'x', filePath: designPath },
        { name: 'eval-skill', description: 'y', filePath: evalPath },
      ]);
      const wrapper = new SessionScopedResourceLoader(base, { sessionType: 'design' });
      await wrapper.refreshSkills();

      const filtered = wrapper.getSkills().skills;
      expect(filtered.map((s) => s.name)).toEqual(['design-skill']);

      // Other accessors pass through.
      expect(wrapper.getPrompts().prompts).toEqual([]);
      expect(wrapper.getSystemPrompt()).toBeUndefined();
      expect(wrapper.getAppendSystemPrompt()).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('lets multiple session tags match (sessionTags override)', async () => {
    clearSkillTagCache();
    const tmp = mkdtempSync(join(tmpdir(), 'pi-pkg-skills-multi-'));
    try {
      const skill = join(tmp, 'multi');
      mkdirSync(skill);
      const filePath = join(skill, 'SKILL.md');
      writeFileSync(filePath, '---\ntags: [design, evaluation]\n---\nbody');

      const base = fakeBaseLoader([{ name: 'multi', description: 'x', filePath }]);
      const wrapper = new SessionScopedResourceLoader(base, {
        sessionType: 'design',
        sessionTags: ['evaluation'],
      });
      await wrapper.refreshSkills();
      expect(wrapper.getSkills().skills.map((s) => s.name)).toEqual(['multi']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('drops untagged skills entirely', async () => {
    clearSkillTagCache();
    const tmp = mkdtempSync(join(tmpdir(), 'pi-pkg-skills-untagged-'));
    try {
      const skill = join(tmp, 'no-tags');
      mkdirSync(skill);
      const filePath = join(skill, 'SKILL.md');
      writeFileSync(filePath, '---\nname: x\n---\nbody');
      const base = fakeBaseLoader([{ name: 'no-tags', description: 'x', filePath }]);
      const wrapper = new SessionScopedResourceLoader(base, { sessionType: 'design' });
      await wrapper.refreshSkills();
      expect(wrapper.getSkills().skills).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('defaultSkillTagLookup', () => {
  it('returns [] for missing files without throwing', async () => {
    clearSkillTagCache();
    const tags = await defaultSkillTagLookup({ filePath: '/definitely/does/not/exist.md' });
    expect(tags).toEqual([]);
  });
});
