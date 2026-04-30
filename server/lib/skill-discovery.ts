/**
 * Runtime discovery of repo-backed Agent Skills (skills/<key>/SKILL.md plus optional resources).
 * Skills are **optional** catalog entries: invalid YAML or schema failures omit the skill (see dev warnings).
 * Contrast `prompt-discovery.ts`: the system `PROMPT.md` is required and throws when invalid.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { env } from '../env.ts';
import { splitYamlFrontmatter } from './frontmatter.ts';
import {
  skillFrontmatterSchema,
  type LoadedSkillSummary,
  type SkillCatalogEntry,
  type SkillResourceEntry,
  type SkillResourceKind,
} from './skill-schema.ts';

export type { SkillCatalogEntry, SkillResourceEntry };

export const SKILL_FILENAME = 'SKILL.md';
export const SKILL_RESOURCE_READ_MAX_BYTES = 50 * 1024;

const TEXT_RESOURCE_EXTENSIONS = new Set([
  '.css',
  '.csv',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.markdown',
  '.mjs',
  '.py',
  '.sh',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

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
    resources: await discoverSkillResources(dir),
  };
}

async function discoverSkillResources(skillDir: string): Promise<SkillResourceEntry[]> {
  const resources: SkillResourceEntry[] = [];

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(absDir);
    } catch {
      return;
    }

    for (const name of entries) {
      if (shouldSkipResourceSegment(name)) continue;
      const relPath = relDir ? `${relDir}/${name}` : name;
      if (relPath === SKILL_FILENAME) continue;

      const absPath = path.join(absDir, name);
      let stat;
      try {
        stat = await fs.lstat(absPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        await walk(absPath, relPath);
        continue;
      }
      if (!stat.isFile()) continue;

      const normalized = normalizeSkillResourcePath(relPath);
      if (!normalized) continue;
      resources.push({
        path: normalized,
        sizeBytes: stat.size,
        kind: classifySkillResource(normalized),
      });
    }
  }

  await walk(skillDir, '');
  return resources.sort((a, b) => a.path.localeCompare(b.path));
}

function classifySkillResource(resourcePath: string): SkillResourceKind {
  return TEXT_RESOURCE_EXTENSIONS.has(path.posix.extname(resourcePath).toLowerCase()) ? 'text' : 'binary';
}

function shouldSkipResourceSegment(segment: string): boolean {
  return segment === '_versions' || segment.startsWith('.');
}

export function normalizeSkillResourcePath(resourcePath: string): string | null {
  const raw = resourcePath.trim().replace(/\\/g, '/');
  if (!raw || raw.startsWith('/')) return null;

  const normalized = path.posix.normalize(raw);
  if (
    !normalized ||
    normalized === '.' ||
    normalized === SKILL_FILENAME ||
    normalized.startsWith('../') ||
    normalized === '..'
  ) {
    return null;
  }
  if (normalized.split('/').some((segment) => !segment || shouldSkipResourceSegment(segment))) return null;
  return normalized;
}

export function findSkillResource(entry: SkillCatalogEntry, resourcePath: string): SkillResourceEntry | null {
  const normalized = normalizeSkillResourcePath(resourcePath);
  if (!normalized) return null;
  return entry.resources.find((resource) => resource.path === normalized) ?? null;
}

export async function readSkillResourceText(
  entry: SkillCatalogEntry,
  resourcePath: string,
): Promise<
  | { ok: true; resource: SkillResourceEntry; text: string }
  | { ok: false; reason: 'missing' | 'binary' | 'too_large'; resource?: SkillResourceEntry }
> {
  const resource = findSkillResource(entry, resourcePath);
  if (!resource) return { ok: false, reason: 'missing' };
  if (resource.kind !== 'text') return { ok: false, reason: 'binary', resource };

  const absPath = path.resolve(entry.dir, resource.path);
  const rootWithSeparator = `${path.resolve(entry.dir)}${path.sep}`;
  if (!absPath.startsWith(rootWithSeparator)) return { ok: false, reason: 'missing' };

  let stat;
  try {
    stat = await fs.lstat(absPath);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return { ok: false, reason: 'missing' };

  const currentResource = { ...resource, sizeBytes: stat.size };
  if (stat.size > SKILL_RESOURCE_READ_MAX_BYTES) {
    return { ok: false, reason: 'too_large', resource: currentResource };
  }

  return { ok: true, resource: currentResource, text: await fs.readFile(absPath, 'utf8') };
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
  const root = resolveSkillsRoot(skillsRoot);
  const cacheKey = `${root}:${key}`;
  const cached = skillBodyCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const entry = await safeReadSkillDir(root, key);
  if (!entry) throw new Error(`Skill "${key}" not found under ${root}`);
  skillBodyCache.set(cacheKey, entry.bodyMarkdown);
  return entry.bodyMarkdown;
}
