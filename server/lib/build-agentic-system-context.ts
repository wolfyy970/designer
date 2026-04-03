/**
 * Fresh agentic system prompt + virtual skill files from DB (genSystemHtmlAgentic + selected skills).
 * Call once per PI session boundary so Prompt Studio / skill edits apply to the next build or revision.
 */
import type { PromptKey } from './prompts/defaults.ts';
import type { EvaluationContextPayload } from '../../src/types/evaluation.ts';
import { buildVirtualSkillFiles, listLatestSkillVersions } from '../db/skills.ts';
import { formatSkillsForPrompt } from './skills/format-for-prompt.ts';
import { selectSkillsForContext } from './skills/select-skills.ts';

export async function buildAgenticSystemContext(input: {
  getPromptBody: (key: PromptKey) => Promise<string>;
  evaluationContext?: EvaluationContextPayload;
}): Promise<{ systemPrompt: string; virtualSkillFiles: Record<string, string> }> {
  const latestSkills = await listLatestSkillVersions();
  const skillRows = latestSkills.map((r) => ({
    key: r.skillKey,
    name: r.name,
    description: r.description,
    nodeTypes: r.nodeTypes,
  }));
  const selectedSkills = selectSkillsForContext(skillRows, input.evaluationContext);
  const selectedKeys = new Set(selectedSkills.map((s) => s.key));
  const virtualSkillFiles: Record<string, string> = {};
  for (const r of latestSkills) {
    if (selectedKeys.has(r.skillKey)) {
      Object.assign(virtualSkillFiles, buildVirtualSkillFiles(r));
    }
  }
  const skillCatalog = formatSkillsForPrompt(
    selectedSkills.map((s) => ({
      name: s.key,
      description: s.description,
      location: `skills/${s.key}/SKILL.md`,
    })),
  );
  const baseAgenticPrompt = await input.getPromptBody('genSystemHtmlAgentic');
  const systemPrompt = skillCatalog ? `${baseAgenticPrompt}\n${skillCatalog}` : baseAgenticPrompt;
  return { systemPrompt, virtualSkillFiles };
}
