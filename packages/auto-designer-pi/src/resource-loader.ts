/**
 * SessionScopedResourceLoader: a thin wrapper over Pi's `ResourceLoader` that
 * filters the visible skill list by session type. Everything else (extensions,
 * prompt templates, themes, system prompt, agents files) passes through
 * unchanged so we don't fight Pi's loaders for content shape.
 *
 * Skills are tagged in their YAML frontmatter (`tags: [design, evaluation]`).
 * Pi's `Skill` type strips arbitrary frontmatter, so we expose a `getSkillTags`
 * hook that callers populate however they like — by re-parsing the SKILL.md
 * file, by consulting a side manifest, or by pre-bundling a tag map.
 *
 * `withSessionScopedSkillFilter` is the convenience wrapper that builds a
 * filename-keyed cache so every render of the prompt for one session reuses
 * the same skill list.
 */
import { readFile } from 'node:fs/promises';
import type { ResourceLoader } from './internal/pi-types.ts';

export type SessionType =
  | 'design'
  | 'evaluation'
  | 'incubation'
  | 'inputs-gen'
  | 'design-system'
  | 'internal-context';

/** Tags associated with each session type. A skill is visible to a session if any of its tags matches. */
export const SESSION_TAGS: Record<SessionType, readonly string[]> = {
  design: ['design'],
  evaluation: ['evaluation'],
  incubation: ['incubation'],
  'inputs-gen': ['inputs-gen'],
  'design-system': ['design-system'],
  'internal-context': ['internal-context'],
} as const;

interface SkillLike {
  filePath: string;
}

export type SkillTagLookup = (skill: SkillLike) => string[] | Promise<string[]>;

const tagsCache = new Map<string, string[]>();

/**
 * Default tag lookup: parse the leading `---` YAML block of each `SKILL.md` and
 * pull out a `tags:` array. Cached by file path.
 *
 * Recognized forms:
 *   tags: [a, b]
 *   tags: ["a", "b"]
 *   tags:
 *     - a
 *     - b
 */
export const defaultSkillTagLookup: SkillTagLookup = async (skill) => {
  const cached = tagsCache.get(skill.filePath);
  if (cached) return cached;

  let body: string;
  try {
    body = await readFile(skill.filePath, 'utf8');
  } catch {
    tagsCache.set(skill.filePath, []);
    return [];
  }

  const tags = parseTagsFromFrontmatter(body);
  tagsCache.set(skill.filePath, tags);
  return tags;
};

/** Clear the in-process tag cache (test helper / reload hook). */
export function clearSkillTagCache(): void {
  tagsCache.clear();
}

export function parseTagsFromFrontmatter(body: string): string[] {
  if (!body.startsWith('---')) return [];
  const end = body.indexOf('\n---', 3);
  if (end < 0) return [];
  const lines = body.slice(3, end).split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inline = /^tags:\s*\[(.*?)\]\s*$/.exec(line);
    if (inline?.[1] !== undefined) return splitInlineTagList(inline[1]);
    if (/^tags:\s*$/.test(line)) {
      const out: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^\s*-\s*(.+?)\s*$/.exec(lines[j]);
        if (!item) break;
        out.push(item[1].replace(/^["']|["']$/g, '').trim());
      }
      return out;
    }
  }
  return [];
}

function splitInlineTagList(inner: string): string[] {
  return inner
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((s) => s.length > 0);
}

export interface SessionScopedSkillFilterOptions {
  sessionType: SessionType;
  /** Override the per-session tag set if the host has its own taxonomy. */
  sessionTags?: readonly string[];
  /** How to look up tags for each skill. Defaults to `defaultSkillTagLookup`. */
  getSkillTags?: SkillTagLookup;
}

/**
 * Wrap a Pi `ResourceLoader` so its `getSkills()` returns only skills whose tags
 * intersect the active session's tag set. All other accessors delegate.
 *
 * Pi calls `getSkills()` synchronously when building the system prompt, so the
 * filter has to be sync — we resolve tags at construction time and stash the
 * filtered list. Callers should call `loader.refreshSkills()` after `reload()`
 * to re-run the lookup.
 */
export class SessionScopedResourceLoader implements ResourceLoader {
  private readonly base: ResourceLoader;
  private readonly sessionTags: readonly string[];
  private readonly getSkillTags: SkillTagLookup;
  private cachedSkills?: ReturnType<ResourceLoader['getSkills']>;

  constructor(base: ResourceLoader, options: SessionScopedSkillFilterOptions) {
    this.base = base;
    this.sessionTags = options.sessionTags ?? SESSION_TAGS[options.sessionType];
    this.getSkillTags = options.getSkillTags ?? defaultSkillTagLookup;
  }

  /** Eagerly resolve the filtered skill list. Call once after the base loader's `reload()`. */
  async refreshSkills(): Promise<void> {
    const { skills, diagnostics } = this.base.getSkills();
    const allowed = new Set(this.sessionTags);
    const kept: typeof skills = [];
    for (const skill of skills) {
      const tags = await this.getSkillTags(skill);
      if (tags.length === 0) continue;
      if (tags.some((t) => allowed.has(t))) {
        kept.push(skill);
      }
    }
    this.cachedSkills = { skills: kept, diagnostics };
  }

  getSkills(): ReturnType<ResourceLoader['getSkills']> {
    return this.cachedSkills ?? this.base.getSkills();
  }

  getExtensions(): ReturnType<ResourceLoader['getExtensions']> {
    return this.base.getExtensions();
  }
  getPrompts(): ReturnType<ResourceLoader['getPrompts']> {
    return this.base.getPrompts();
  }
  getThemes(): ReturnType<ResourceLoader['getThemes']> {
    return this.base.getThemes();
  }
  getAgentsFiles(): ReturnType<ResourceLoader['getAgentsFiles']> {
    return this.base.getAgentsFiles();
  }
  getSystemPrompt(): ReturnType<ResourceLoader['getSystemPrompt']> {
    return this.base.getSystemPrompt();
  }
  getAppendSystemPrompt(): ReturnType<ResourceLoader['getAppendSystemPrompt']> {
    return this.base.getAppendSystemPrompt();
  }
  extendResources(paths: Parameters<ResourceLoader['extendResources']>[0]): void {
    this.base.extendResources(paths);
  }
  async reload(): Promise<void> {
    await this.base.reload();
    await this.refreshSkills();
  }
}
