/**
 * Fresh agentic system prompt + sandbox AGENTS.md seed from Langfuse
 * (`designer-agentic-system` + `agents-md-file`), plus repo-backed Agent Skills.
 * Call once per PI session boundary so Prompt Studio edits and skill picks apply to the next build or revision.
 */
import type { PromptKey } from './prompts/defaults.ts';
import type { LoadedSkillSummary, SkillCatalogEntry } from './skill-schema.ts';
import {
  buildSkillSandboxSeedMap,
  catalogEntriesToSummaries,
  discoverSkills,
  filterSkillsForCatalog,
  resolveSkillsRoot,
} from './skill-discovery.ts';

export async function buildAgenticSystemContext(input: {
  getPromptBody: (key: PromptKey) => Promise<string>;
  /** Override skills root (tests). */
  skillsRoot?: string;
}): Promise<{
  systemPrompt: string;
  sandboxSeedFiles: Record<string, string>;
  /** Non-manual skills pre-seeded + listed in `skills_loaded` SSE / UI. */
  loadedSkills: LoadedSkillSummary[];
  /** Full catalog entries for `use_skill` tool (same set as pre-seed). */
  skillCatalog: SkillCatalogEntry[];
}> {
  const baseAgenticPrompt = await input.getPromptBody('designer-agentic-system');
  const agentsContext = (await input.getPromptBody('agents-md-file')).trim();
  const sandboxSeedFiles: Record<string, string> = {};
  if (agentsContext.length > 0) {
    sandboxSeedFiles['AGENTS.md'] = agentsContext;
  }

  const skillsRoot = resolveSkillsRoot(input.skillsRoot);
  const allEntries = await discoverSkills(skillsRoot);
  const catalogEntries = filterSkillsForCatalog(allEntries);
  const loadedSkills = catalogEntriesToSummaries(catalogEntries);
  const systemPrompt = baseAgenticPrompt;

  const skillSeeds = await buildSkillSandboxSeedMap(catalogEntries);
  Object.assign(sandboxSeedFiles, skillSeeds);

  return { systemPrompt, sandboxSeedFiles, loadedSkills, skillCatalog: catalogEntries };
}

