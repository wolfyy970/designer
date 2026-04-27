import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getPromptBody } from '../prompt-resolution.ts';
import {
  INCUBATOR_USER_INPUTS_TEMPLATE,
  DESIGNER_HYPOTHESIS_INPUTS_TEMPLATE,
} from '../prompt-templates.ts';
import { PROMPT_KEYS, type PromptKey } from '../../../src/lib/prompts/defaults.ts';

const GLUE_KEYS = new Set<PromptKey>(['incubator-user-inputs', 'designer-hypothesis-inputs']);

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

  it('routes designer-agentic-system to PROMPT.md body', async () => {
    const body = await getPromptBody('designer-agentic-system');
    const promptPath = repoPath('prompts', 'designer-agentic-system', 'PROMPT.md');
    const raw = await fs.readFile(promptPath, 'utf8');
    const afterFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, '');
    expect(body.trim()).toBe(afterFrontmatter.trim());
  });

  it.each(
    PROMPT_KEYS.filter((k) => k !== 'designer-agentic-system' && !GLUE_KEYS.has(k)),
  )('routes skill key %s to SKILL.md body', async (key) => {
    const body = await getPromptBody(key);
    expect(body.trim().length).toBeGreaterThan(0);
    const skillPath = repoPath('skills', key, 'SKILL.md');
    const raw = await fs.readFile(skillPath, 'utf8');
    const afterFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, '');
    expect(body.trim()).toBe(afterFrontmatter.trim());
  });

  it('routes the DESIGN.md extraction prompt to the authoritative authoring contract', async () => {
    const body = await getPromptBody('design-system-extract-system');

    expect(body).toContain('Google Labs / Stitch format');
    expect(body).toContain('Write the complete document to `DESIGN.md` in the workspace root.');
    expect(body).toContain('Return only the file content in that file.');
    expect(body).toContain('Do not use non-spec top-level token groups');
  });
});
