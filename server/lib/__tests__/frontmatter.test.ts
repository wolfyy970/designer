import { describe, it, expect } from 'vitest';
import { splitYamlFrontmatter } from '../frontmatter.ts';

describe('splitYamlFrontmatter', () => {
  it('parses frontmatter and body', () => {
    const raw = `---
name: X
---
Hello **body**`;
    const s = splitYamlFrontmatter(raw);
    expect(s?.frontmatterYaml).toContain('name: X');
    expect(s?.body.trim()).toBe('Hello **body**');
  });

  it('returns null without opening ---', () => {
    expect(splitYamlFrontmatter('no frontmatter')).toBeNull();
  });

  it('returns null when closing --- is missing', () => {
    expect(splitYamlFrontmatter('---\nonly open')).toBeNull();
  });
});
