/**
 * Shared YAML frontmatter splitting for PROMPT.md and skills/SKILL.md.
 * Both callers apply their own Zod schema to `frontmatterYaml`.
 */
export { splitFrontmatterMarkdown as splitYamlFrontmatter } from './frontmatter-split.ts';
