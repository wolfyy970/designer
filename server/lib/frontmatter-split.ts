/**
 * Split YAML-frontmatter markdown (`---` … `---`) into frontmatter text and body.
 * Used for `SKILL.md` and `PROMPT.md` loaders.
 */
export function splitFrontmatterMarkdown(raw: string): { frontmatterYaml: string; body: string } | null {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return null;
  const frontmatterYaml = lines.slice(1, end).join('\n');
  const body = lines.slice(end + 1).join('\n').replace(/^\n+/, '');
  return { frontmatterYaml, body };
}
