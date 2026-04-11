/**
 * Zod schemas for Agent Skills (`skills/<key>/SKILL.md` YAML frontmatter).
 */
import { z } from 'zod';

const skillWhenSchema = z.enum(['auto', 'always', 'manual']);

export const skillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  when: skillWhenSchema.optional().default('auto'),
});

export type SkillCatalogEntry = z.infer<typeof skillFrontmatterSchema> & {
  /** Directory name under `skills/` (e.g. `design-quality`). */
  key: string;
  /** Absolute path to the skill package directory. */
  dir: string;
  /** Markdown body after frontmatter (full SKILL.md content excluding frontmatter block). */
  bodyMarkdown: string;
};

export type LoadedSkillSummary = {
  key: string;
  name: string;
  description: string;
};
