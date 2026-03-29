import { describe, it, expect } from 'vitest';
import { formatSkillsForPrompt } from '../format-for-prompt.ts';

describe('formatSkillsForPrompt', () => {
  it('returns empty string when no skills', () => {
    expect(formatSkillsForPrompt([])).toBe('');
  });

  it('escapes XML and lists locations', () => {
    const xml = formatSkillsForPrompt([
      {
        name: 'my-skill',
        description: 'Use for <testing> & "quotes"',
        location: 'skills/my-skill/SKILL.md',
      },
    ]);
    expect(xml).toContain('<name>my-skill</name>');
    expect(xml).toContain('&lt;testing&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('skills/my-skill/SKILL.md');
  });

  it('hides disableModelInvocation skills', () => {
    const xml = formatSkillsForPrompt([
      { name: 'x', description: 'd', location: 'skills/x/SKILL.md', disableModelInvocation: true },
    ]);
    expect(xml).toBe('');
  });
});
