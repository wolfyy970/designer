import { describe, expect, it } from 'vitest';
import { splitFrontmatterMarkdown } from '../frontmatter-split.ts';

describe('splitFrontmatterMarkdown', () => {
  it('parses YAML fence and body', () => {
    const raw = `---
name: x
---
Body line
`;
    const s = splitFrontmatterMarkdown(raw);
    expect(s).not.toBeNull();
    expect(s!.frontmatterYaml).toContain('name: x');
    expect(s!.body.trim()).toBe('Body line');
  });

  it('returns null without opening fence', () => {
    expect(splitFrontmatterMarkdown('no frontmatter')).toBeNull();
  });
});
