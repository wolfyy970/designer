/**
 * Runtime discovery of repo-backed Agent Skills (skills/<key>/SKILL.md per package).
 * Skills are **optional** catalog entries: invalid YAML or schema failures omit the skill (see dev warnings).
 * Contrast `prompt-discovery.ts`: the system `PROMPT.md` is required and throws when invalid.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { env } from '../env.ts';
import { splitYamlFrontmatter } from './frontmatter.ts';
import { skillFrontmatterSchema, type LoadedSkillSummary, type SkillCatalogEntry } from './skill-schema.ts';

export type { SkillCatalogEntry };

export const SKILL_FILENAME = 'SKILL.md';

export type SessionType =
  | 'design'
  | 'incubation'
  | 'internal-context'
  | 'evaluation'
  | 'inputs-gen'
  | 'design-system';

const SESSION_TAGS: Record<SessionType, string[]> = {
  design: ['design'],
  incubation: ['incubation'],
  'internal-context': ['internal-context'],
  evaluation: ['evaluation'],
  'inputs-gen': ['inputs-gen'],
  'design-system': ['design-system'],
};

/** Skills root: repo skills directory, or SKILLS_ROOT env (tests). */
export function resolveSkillsRoot(explicit?: string): string {
  if (explicit?.trim()) return path.resolve(explicit.trim());
  const fromEnv = process.env.SKILLS_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), 'skills');
}

/** Split `SKILL.md` into YAML frontmatter and body. */
export function splitSkillMarkdown(raw: string): { frontmatterYaml: string; body: string } | null {
  return splitYamlFrontmatter(raw);
}

async function safeReadSkillDir(skillsRoot: string, name: string): Promise<SkillCatalogEntry | null> {
  if (name.startsWith('_') || name.startsWith('.')) return null;
  const dir = path.join(skillsRoot, name);
  const skillPath = path.join(dir, SKILL_FILENAME);
  let raw: string;
  try {
    raw = await fs.readFile(skillPath, 'utf8');
  } catch {
    return null;
  }
  const split = splitSkillMarkdown(raw);
  if (!split) return null;
  let data: unknown;
  try {
    data = parseYaml(split.frontmatterYaml);
  } catch (err) {
    if (env.isDev) {
      console.warn(`[skill-discovery] Invalid YAML in ${skillPath}`, err);
    }
    return null;
  }
  const parsed = skillFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    if (env.isDev) {
      console.warn(`[skill-discovery] Invalid skill frontmatter in ${skillPath}`, parsed.error.flatten());
    }
    return null;
  }

  return {
    ...parsed.data,
    key: name,
    dir,
    bodyMarkdown: split.body,
  };
}

/**
 * Walk each subdirectory under the skills root for SKILL.md (invalid packages omitted).
 */
/** Filter skills for a specific Pi session type by matching tags. */
export function filterSkillsForSession(entries: SkillCatalogEntry[], sessionType: SessionType): SkillCatalogEntry[] {
  const allowedTags = SESSION_TAGS[sessionType];
  return entries.filter((e) => {
    if (e.when === 'manual') return false;
    return e.tags.some((t) => allowedTags.includes(t));
  });
}

export async function discoverSkills(skillsRoot: string): Promise<SkillCatalogEntry[]> {
  let names: string[];
  try {
    names = await fs.readdir(skillsRoot);
  } catch {
    return [];
  }
  const out: SkillCatalogEntry[] = [];
  for (const name of names) {
    const ent = await safeReadSkillDir(skillsRoot, name);
    if (ent) out.push(ent);
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function catalogEntriesToSummaries(entries: SkillCatalogEntry[]): LoadedSkillSummary[] {
  return entries.map((s) => ({
    key: s.key,
    name: s.name,
    description: s.description,
  }));
}

type CatalogSkillXmlRow = {
  key: string;
  name: string;
  description: string;
};

/**
 * Build `<available_skills>` XML (for embedding in the use_skill tool description).
 */
export function formatSkillsCatalogXml(rows: CatalogSkillXmlRow[]): string {
  if (rows.length === 0) return '';
  const intro = [
    "Load a skill's full instructions into context. Call before implementing work that matches a skill's description.",
    'Parameter `name` is the skill key (directory name under skills/), same as the XML `key` attribute below.',
    '',
  ].join('\n');
  const lines = rows.map(
    (s) =>
      `  <skill key="${escapeXmlAttr(s.key)}" name="${escapeXmlAttr(s.name)}">${escapeXmlAttr(s.description)}</skill>`,
  );
  return `\n\n<available_skills>\n${intro}${lines.join('\n')}\n</available_skills>\n`;
}

/** Full tool description string for Pi use_skill (empty catalog still registers the tool). */
export function buildUseSkillToolDescription(rows: CatalogSkillXmlRow[]): string {
  const catalog = formatSkillsCatalogXml(rows).trim();
  if (!catalog) {
    return (
      'use_skill: No repo skills are configured for this session (or all are manual). ' +
      'Do not call this tool until skills exist.'
    );
  }
  return `use_skill: ${catalog}`;
}

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const skillBodyCache = new Map<string, string>();

/** Read a skill's markdown body by key (directory name under skills/). Cached. */
export async function getSkillBody(key: string, skillsRoot?: string): Promise<string> {
  const cached = skillBodyCache.get(key);
  if (cached !== undefined) return cached;
  const root = resolveSkillsRoot(skillsRoot);
  const entry = await safeReadSkillDir(root, key);
  if (!entry) throw new Error(`Skill "${key}" not found under ${root}`);
  skillBodyCache.set(key, entry.bodyMarkdown);
  return entry.bodyMarkdown;
}
