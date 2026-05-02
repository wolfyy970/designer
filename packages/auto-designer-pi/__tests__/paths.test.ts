import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import {
  PACKAGE_DESIGNER_SYSTEM_PROMPT_PATH,
  PACKAGE_COMPACTION_PROMPT_PATH,
  PACKAGE_PROMPTS_DIR,
  PACKAGE_SKILLS_DIR,
  loadCompactionPrompt,
  loadDesignerSystemPrompt,
} from '../src/paths';

describe('package paths', () => {
  it('PACKAGE_SKILLS_DIR points at an existing directory', () => {
    expect(existsSync(PACKAGE_SKILLS_DIR)).toBe(true);
  });

  it('PACKAGE_PROMPTS_DIR points at an existing directory', () => {
    expect(existsSync(PACKAGE_PROMPTS_DIR)).toBe(true);
  });

  it('PACKAGE_DESIGNER_SYSTEM_PROMPT_PATH exists', () => {
    expect(existsSync(PACKAGE_DESIGNER_SYSTEM_PROMPT_PATH)).toBe(true);
  });

  it('PACKAGE_COMPACTION_PROMPT_PATH exists', () => {
    expect(existsSync(PACKAGE_COMPACTION_PROMPT_PATH)).toBe(true);
  });
});

describe('loadDesignerSystemPrompt', () => {
  it('returns a non-empty body with frontmatter stripped', () => {
    const body = loadDesignerSystemPrompt();
    expect(body.length).toBeGreaterThan(100);
    expect(body.startsWith('---')).toBe(false);
  });
});

describe('loadCompactionPrompt', () => {
  it('returns a non-empty compaction body', () => {
    const body = loadCompactionPrompt();
    expect(body.length).toBeGreaterThan(50);
  });
});
