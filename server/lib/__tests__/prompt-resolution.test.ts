import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getPromptBody } from '../prompt-resolution.ts';
import {
  INCUBATOR_USER_INPUTS_TEMPLATE,
  DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE,
} from '../prompt-templates.ts';
import type { PromptKey } from '../../../src/lib/prompts/defaults.ts';

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

function repoPath(...segments: string[]): string {
  return path.resolve(process.cwd(), ...segments);
}

describe('getPromptBody', () => {
  it('routes incubator-user-inputs to glue template', async () => {
    const body = await getPromptBody('incubator-user-inputs');
    expect(body).toBe(INCUBATOR_USER_INPUTS_TEMPLATE);
  });

  it('routes designer-hypothesis-inputs to glue template', async () => {
    const body = await getPromptBody('designer-hypothesis-inputs');
    expect(body).toBe(DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE);
  });

  it('routes designer-agentic-system to the @auto-designer/pi bundled body', async () => {
    const body = await getPromptBody('designer-agentic-system');
    const promptPath = repoPath('packages', 'auto-designer-pi', 'prompts', '_designer-system.md');
    const raw = await fs.readFile(promptPath, 'utf8');
    const afterFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, '');
    expect(body.trim()).toBe(afterFrontmatter.trim());
  });

  it.each(Object.entries(PACKAGE_PROMPT_FILES) as [PromptKey, string][])(
    'routes migrated key %s to package prompt %s',
    async (key, filename) => {
      const body = await getPromptBody(key);
      expect(body.trim().length).toBeGreaterThan(0);
      const promptPath = repoPath('packages', 'auto-designer-pi', 'prompts', filename);
      const raw = await fs.readFile(promptPath, 'utf8');
      const afterFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, '');
      expect(body.trim()).toBe(afterFrontmatter.trim());
    },
  );

  it('routes the DESIGN.md extraction prompt to the authoritative authoring contract', async () => {
    const body = await getPromptBody('design-system-extract-system');

    expect(body).toContain('Google Labs / Stitch format');
    expect(body).toContain('Write the complete document to `DESIGN.md` in the workspace root.');
    expect(body).toContain('Return only the file content in that file.');
    expect(body).toContain('Do not use non-spec top-level token groups');
  });
});
