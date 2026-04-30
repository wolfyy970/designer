/**
 * Zod schemas for Agent Skills (`skills/<key>/SKILL.md` YAML frontmatter).
 */
import { z } from 'zod';

const skillWhenSchema = z.enum(['auto', 'always', 'manual']);

export const skillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).max(1024),
  'allowed-tools': z.union([z.string(), z.array(z.string())]).optional(),
  dependencies: z.union([z.string(), z.array(z.string())]).optional(),
  tags: z.array(z.string()).optional().default([]),
  when: skillWhenSchema.optional().default('auto'),
});

export type SkillResourceKind = 'text' | 'binary';

export type SkillResourceEntry = {
  /** POSIX-style path relative to the skill package directory. */
  path: string;
  sizeBytes: number;
  kind: SkillResourceKind;
};

export type SkillCatalogEntry = z.infer<typeof skillFrontmatterSchema> & {
  /** Directory name under `skills/` (e.g. `design-quality`). */
  key: string;
  /** Absolute path to the skill package directory. */
  dir: string;
  /** Markdown body after frontmatter (full SKILL.md content excluding frontmatter block). */
  bodyMarkdown: string;
  /** Optional package resources outside SKILL.md, excluding history and hidden files. */
  resources: SkillResourceEntry[];
};

export type LoadedSkillSummary = {
  key: string;
  name: string;
  description: string;
};
