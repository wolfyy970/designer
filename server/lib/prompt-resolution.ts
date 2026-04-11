/**
 * Unified prompt body resolution — reads from skills, system prompt files, or code constants.
 *
 * Replaces the legacy DB-backed `getPromptBody` path.
 * All prompt content is repo-backed: SKILL.md files, PROMPT.md files, or glue templates.
 */
import type { PromptKey } from '../../src/lib/prompts/defaults.ts';
import { getSkillBody } from './skill-discovery.ts';
import { getSystemPromptBody } from './prompt-discovery.ts';
import {
  INCUBATOR_USER_INPUTS_TEMPLATE,
  DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE,
} from './prompt-templates.ts';

const GLUE_TEMPLATES: Partial<Record<PromptKey, string>> = {
  'incubator-user-inputs': INCUBATOR_USER_INPUTS_TEMPLATE,
  'designer-hypothesis-inputs': DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE,
};

/**
 * Resolve prompt body by key. Routes to the appropriate source:
 * - `designer-agentic-system` → PROMPT.md (system prompt file)
 * - `incubator-user-inputs` / `designer-hypothesis-inputs` → code constants (glue templates)
 * - Everything else → SKILL.md (skill files)
 */
export async function getPromptBody(key: PromptKey): Promise<string> {
  if (key === 'designer-agentic-system') {
    return getSystemPromptBody('designer-agentic-system');
  }

  const glue = GLUE_TEMPLATES[key];
  if (glue !== undefined) return glue;

  return getSkillBody(key);
}
