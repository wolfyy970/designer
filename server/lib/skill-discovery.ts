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
const MAX_SEED_FILE_BYTES = 256_000;

export type SessionType = 'design' | 'incubation' | 'evaluation' | 'inputs-gen' | 'design-system';

const SESSION_TAGS: Record<SessionType, string[]> = {
  design: ['design'],
  incubation: ['incubation'],
  evaluation: ['evaluation'],
  'inputs-gen': ['inputs-gen'],
  'design-system': ['design-system'],
};

const TEXT_EXT = new Set([
  '.md',
  '.txt',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.svg',
  '.tsx',
  '.ts',
  '.jsx',
]);

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

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) return false;
  return TEXT_EXT.has(ext);
}

async function collectRelativeFiles(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_versions') continue;
    const abs = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...(await collectRelativeFiles(abs, rel)));
    } else {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Read all text files under a skill package into sandbox-relative paths `skills/<key>/<rel>`.
 */
export async function loadSkillPackageSeedFiles(skill: SkillCatalogEntry): Promise<Record<string, string>> {
  const rels = await collectRelativeFiles(skill.dir, '');
  const seed: Record<string, string> = {};
  for (const rel of rels) {
    if (rel === SKILL_FILENAME || !isTextFile(rel)) continue;
    const abs = path.join(skill.dir, rel);
    let st: Awaited<ReturnType<typeof fs.stat>>;
    try {
      st = await fs.stat(abs);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > MAX_SEED_FILE_BYTES) continue;
    try {
      const body = await fs.readFile(abs, 'utf8');
      seed[`skills/${skill.key}/${rel}`] = body;
    } catch {
      /* ignore */
    }
  }
  return seed;
}

/** Full SKILL.md body at `skills/<key>/SKILL.md` plus optional reference files. */
export async function buildSkillSandboxSeedMap(selected: SkillCatalogEntry[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const s of selected) {
    out[`skills/${s.key}/${SKILL_FILENAME}`] = s.bodyMarkdown;
    const extras = await loadSkillPackageSeedFiles(s);
    Object.assign(out, extras);
  }
  return out;
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
  path: string;
};

/**
 * Build `<available_skills>` XML (for embedding in the use_skill tool description).
 * `variant: 'tool'` — routing copy + use_skill naming; `system_prompt` is deprecated (catalog lives on tool only).
 */
export function formatSkillsCatalogXml(
  rows: CatalogSkillXmlRow[],
  variant: 'tool' | 'system_prompt' = 'tool',
): string {
  if (rows.length === 0) return '';
  const intro =
    variant === 'tool'
      ? [
          "Load a skill's full instructions into context. Call before implementing work that matches a skill's description.",
          'Parameter `name` is the skill key (directory name under skills/), same as the XML `key` attribute below.',
          '',
        ].join('\n')
      : [
          '  Skill packages are under skills/&lt;key&gt;/SKILL.md (your system prompt describes when to consult them).',
          '  Match entries to the hypothesis and milestones; read only paths you will apply this run. Do not bulk-read every skill.',
          '',
        ].join('\n');
  const lines = rows.map(
    (s) =>
      `  <skill key="${escapeXmlAttr(s.key)}" name="${escapeXmlAttr(s.name)}" path="${escapeXmlAttr(s.path)}">${escapeXmlAttr(s.description)}</skill>`,
  );
  return `\n\n<available_skills>\n${intro}${lines.join('\n')}\n</available_skills>\n`;
}

/** Full tool description string for Pi use_skill (empty catalog still registers the tool). */
export function buildUseSkillToolDescription(rows: CatalogSkillXmlRow[]): string {
  const catalog = formatSkillsCatalogXml(rows, 'tool').trim();
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
