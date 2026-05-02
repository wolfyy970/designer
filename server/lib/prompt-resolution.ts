/**
 * Unified prompt body resolution — every prompt body lives in either
 * `@auto-designer/pi`'s bundled prompts or a host-side glue template.
 */
import { loadDesignerSystemPrompt, loadPackagePromptBody } from '@auto-designer/pi';
import type { PromptKey } from '../../src/lib/prompts/defaults.ts';
import {
  INCUBATOR_USER_INPUTS_TEMPLATE,
  DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE,
} from './prompt-templates.ts';

const GLUE_TEMPLATES: Partial<Record<PromptKey, string>> = {
  'incubator-user-inputs': INCUBATOR_USER_INPUTS_TEMPLATE,
  'designer-hypothesis-inputs': DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE,
};

/** PromptKey → bundled prompt filename in `@auto-designer/pi/prompts/`. */
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
 * - `designer-agentic-system` → package's `_designer-system.md`
 * - `incubator-user-inputs` / `designer-hypothesis-inputs` → glue templates
 * - everything else → bundled package prompt template
 */
export async function getPromptBody(key: PromptKey): Promise<string> {
  if (key === 'designer-agentic-system') {
    return loadDesignerSystemPrompt();
  }

  const glue = GLUE_TEMPLATES[key];
  if (glue !== undefined) return glue;

  const packageFile = PACKAGE_PROMPT_FILES[key];
  if (packageFile !== undefined) return loadPackagePromptBody(packageFile);

  throw new Error(`getPromptBody: unhandled PromptKey "${key}"`);
}
