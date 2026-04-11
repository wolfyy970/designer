/**
 * Fresh agentic system prompt + sandbox seed from disk-backed skills and PROMPT.md.
 * Call once per PI session boundary so skill edits apply to the next build or revision.
 */
import type { LoadedSkillSummary, SkillCatalogEntry } from './skill-schema.ts';
import {
  buildSkillSandboxSeedMap,
  catalogEntriesToSummaries,
  discoverSkills,
  filterSkillsForSession,
  resolveSkillsRoot,
  getSkillBody,
  type SessionType,
} from './skill-discovery.ts';
import { getSystemPromptBody } from './prompt-discovery.ts';
import { env } from '../env.ts';

export async function buildAgenticSystemContext(input: {
  /** Session type controls which skills are visible. Defaults to 'design'. */
  sessionType?: SessionType;
  /** Override skills root (tests). */
  skillsRoot?: string;
}): Promise<{
  systemPrompt: string;
  sandboxSeedFiles: Record<string, string>;
  /** Skills pre-seeded + listed in `skills_loaded` SSE / UI. */
  loadedSkills: LoadedSkillSummary[];
  /** Full catalog entries for `use_skill` tool (same set as pre-seed). */
  skillCatalog: SkillCatalogEntry[];
}> {
  const systemPrompt = await getSystemPromptBody('designer-agentic-system');
  const sandboxSeedFiles: Record<string, string> = {};

  const sessionType = input.sessionType ?? 'design';

  if (sessionType === 'design') {
    const agentsContext = (await getSkillBody('agents-md-file', input.skillsRoot)).trim();
    if (agentsContext.length > 0) {
      sandboxSeedFiles['AGENTS.md'] = agentsContext;
    }
  }

  const skillsRoot = resolveSkillsRoot(input.skillsRoot);
  const allEntries = await discoverSkills(skillsRoot);
  const catalogEntries = filterSkillsForSession(allEntries, sessionType);
  const loadedSkills = catalogEntriesToSummaries(catalogEntries);

  const skillSeeds = await buildSkillSandboxSeedMap(catalogEntries);
  Object.assign(sandboxSeedFiles, skillSeeds);

  if (env.isDev) {
    console.debug('[agentic-context] skills', {
      sessionType,
      discovered: allEntries.length,
      filtered: catalogEntries.length,
      keys: catalogEntries.map((e) => e.key),
      seedFileCount: Object.keys(sandboxSeedFiles).length,
      systemPromptChars: systemPrompt.length,
    });
  }

  return { systemPrompt, sandboxSeedFiles, loadedSkills, skillCatalog: catalogEntries };
}
