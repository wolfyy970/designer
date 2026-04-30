/**
 * Fresh agentic system prompt + skill catalog from disk-backed skills and PROMPT.md.
 * Call once per PI session boundary so skill edits apply to the next build or revision.
 *
 * Skills are **not** copied into the just-bash virtual filesystem; the agent loads SKILL.md via
 * `use_skill` and optional sibling resources through host-backed skill resource tools.
 * The returned `sandboxSeedFiles` is always empty unless callers add seeds
 * (e.g. revision rounds merge prior design files in the orchestrator).
 */
import type { LoadedSkillSummary, SkillCatalogEntry } from './skill-schema.ts';
import {
  catalogEntriesToSummaries,
  discoverSkills,
  filterSkillsForSession,
  resolveSkillsRoot,
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
  /** Always empty from this builder; orchestrator may pass prior design files as seeds for revisions. */
  sandboxSeedFiles: Record<string, string>;
  /** Skills listed in `skills_loaded` SSE / UI and in the `use_skill` tool catalog. */
  loadedSkills: LoadedSkillSummary[];
  /** Full catalog entries for `use_skill` tool (host-backed reads). */
  skillCatalog: SkillCatalogEntry[];
}> {
  const systemPrompt = await getSystemPromptBody('designer-agentic-system');
  const sandboxSeedFiles: Record<string, string> = {};

  const sessionType = input.sessionType ?? 'design';

  const skillsRoot = resolveSkillsRoot(input.skillsRoot);
  const allEntries = await discoverSkills(skillsRoot);
  const catalogEntries = filterSkillsForSession(allEntries, sessionType);
  const loadedSkills = catalogEntriesToSummaries(catalogEntries);

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
