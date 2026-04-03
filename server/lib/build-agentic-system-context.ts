/**
 * Fresh agentic system prompt + sandbox AGENTS.md seed from Langfuse
 * (`genSystemHtmlAgentic` + `sandboxAgentsContext`), plus repo-backed Agent Skills.
 * Call once per PI session boundary so Prompt Studio edits and skill picks apply to the next build or revision.
 */
import type { PromptKey } from './prompts/defaults.ts';
import type { LoadedSkillSummary } from './skill-schema.ts';
import {
  buildSkillSandboxSeedMap,
  catalogEntriesToSummaries,
  discoverSkills,
  filterSkillsForCatalog,
  formatSkillsCatalogXml,
  resolveSkillsRoot,
  SKILL_FILENAME,
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
}> {
  const baseAgenticPrompt = await input.getPromptBody('genSystemHtmlAgentic');
  const agentsContext = (await input.getPromptBody('sandboxAgentsContext')).trim();
  const sandboxSeedFiles: Record<string, string> = {};
  if (agentsContext.length > 0) {
    sandboxSeedFiles['AGENTS.md'] = agentsContext;
  }

  const skillsRoot = resolveSkillsRoot(input.skillsRoot);
  const allEntries = await discoverSkills(skillsRoot);
  const catalogEntries = filterSkillsForCatalog(allEntries);
  const loadedSkills = catalogEntriesToSummaries(catalogEntries);
  const catalogXmlRows = catalogEntries.map((e) => ({
    key: e.key,
    name: e.name,
    description: e.description,
    path: `skills/${e.key}/${SKILL_FILENAME}`,
  }));
  const catalogXml = formatSkillsCatalogXml(catalogXmlRows);
  const systemPrompt = `${baseAgenticPrompt}${catalogXml}`;

  const skillSeeds = await buildSkillSandboxSeedMap(catalogEntries);
  Object.assign(sandboxSeedFiles, skillSeeds);

  return { systemPrompt, sandboxSeedFiles, loadedSkills };
}

