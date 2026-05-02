/**
 * Unified prompt body resolution — reads from the @auto-designer/pi package prompts,
 * system prompt files, or code-constant glue templates.
 *
 * Migration note: keys that used to resolve to a SKILL.md under `skills/` were
 * reclassified as Pi prompt templates and now live in the package's `prompts/`
 * directory. They are mapped here so existing callers (evaluator dispatch, etc.)
 * keep working without each one knowing about the package layout.
 */
import { loadPackagePromptBody } from '@auto-designer/pi';
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
 * PromptKey → bundled prompt filename in `@auto-designer/pi/prompts/`.
 * Keys absent from this map fall through to legacy `getSkillBody` (still needed
 * for keys whose body has not migrated to the package yet).
 */
const PACKAGE_PROMPT_FILES: Partial<Record<PromptKey, string>> = {
  'hypotheses-generator-system': 'gen-hypotheses.md',
  'evaluator-design-quality': 'eval-design-quality.md',
  'evaluator-strategy-fidelity': 'eval-strategy-fidelity.md',
  'evaluator-implementation': 'eval-implementation.md',
  'inputs-gen-research-context': 'gen-research.md',
  'inputs-gen-objectives-metrics': 'gen-objectives.md',
  'inputs-gen-design-constraints': 'gen-constraints.md',
  'design-system-extract-system': 'ds-extract.md',
  'design-system-extract-user-input': 'ds-extract-input.md',
  'designer-agentic-revision-user': 'revise.md',
  'agents-md-file': 'artifact-conventions.md',
};

/**
 * Resolve prompt body by key. Routes to the appropriate source:
 * - `designer-agentic-system` → PROMPT.md (system prompt file)
 * - `incubator-user-inputs` / `designer-hypothesis-inputs` → glue templates
 * - migrated keys → package prompt template body
 * - Everything else → SKILL.md (skill files)
 */
export async function getPromptBody(key: PromptKey): Promise<string> {
  if (key === 'designer-agentic-system') {
    return getSystemPromptBody('designer-agentic-system');
  }

  const glue = GLUE_TEMPLATES[key];
  if (glue !== undefined) return glue;

  const packageFile = PACKAGE_PROMPT_FILES[key];
  if (packageFile !== undefined) return loadPackagePromptBody(packageFile);

  return getSkillBody(key);
}
