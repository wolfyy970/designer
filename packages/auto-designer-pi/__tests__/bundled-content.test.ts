/**
 * Verify the package's bundled `skills/` and `prompts/` content has the right shape.
 * Catches frontmatter regressions and missing tags before they slip into a release.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../src/paths';
import { parseTagsFromFrontmatter } from '../src/resource-loader';

const PKG_ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SKILLS_DIR = join(PKG_ROOT, 'skills');
const PROMPTS_DIR = join(PKG_ROOT, 'prompts');

const EXPECTED_SKILLS = [
  'accessibility',
  'design-quality',
] as const;

const EXPECTED_PROMPTS = [
  'design-agent-instructions.md',
  'ds-extract-input.md',
  'ds-extract.md',
  'ds-generate.md',
  'eval-design-quality.md',
  'eval-implementation.md',
  'eval-strategy-fidelity.md',
  'gen-constraints.md',
  'gen-hypotheses.md',
  'gen-objectives.md',
  'gen-research.md',
  'revise.md',
  '_designer-system.md',
] as const;

/**
 * Frontmatter for a bundled file, via the REAL parser.
 *
 * This used to be a local re-implementation — the fourth copy of the fence scan,
 * with the same `startsWith('---')` + `indexOf('\n---')` weakness that made the
 * package leak raw YAML into the system prompt on a BOM-encoded file. A test
 * that parses with its own copy cannot catch a parser regression, which is the
 * one thing this suite exists to do.
 */
function readFrontmatter(text: string): Record<string, string> {
  const { yaml } = parseFrontmatter(text);
  const out: Record<string, string> = {};
  if (yaml === undefined) return out;
  for (const line of yaml.split('\n')) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m && m[2] && !m[2].startsWith('-')) out[m[1]!] = m[2].trim();
  }
  return out;
}

describe('bundled skills/', () => {
  it('contains the expected skill packages', () => {
    const found = readdirSync(SKILLS_DIR).filter((d) =>
      statSync(join(SKILLS_DIR, d)).isDirectory(),
    );
    for (const skill of EXPECTED_SKILLS) {
      expect(found).toContain(skill);
    }
  });

  it.each(EXPECTED_SKILLS)('skill %s has SKILL.md with name + description + tags', (skill: string) => {
    const path = join(SKILLS_DIR, skill, 'SKILL.md');
    const body = readFileSync(path, 'utf8');
    const fm = readFrontmatter(body);
    expect(fm.name, `${skill}: missing frontmatter \`name\``).toBeTruthy();
    expect(fm.description, `${skill}: missing frontmatter \`description\``).toBeTruthy();

    const tags = parseTagsFromFrontmatter(body);
    expect(tags.length, `${skill}: needs at least one tag for session filtering`).toBeGreaterThan(0);
  });
});

describe('bundled prompts/', () => {
  it('contains the expected prompt-template files (top level only — Pi does not recurse)', () => {
    const found = readdirSync(PROMPTS_DIR)
      .filter((d) => !statSync(join(PROMPTS_DIR, d)).isDirectory())
      .filter((d) => d.endsWith('.md'));
    for (const prompt of EXPECTED_PROMPTS) {
      expect(found).toContain(prompt);
    }
  });

  it.each(EXPECTED_PROMPTS)('prompt %s has frontmatter with description', (filename: string) => {
    const path = join(PROMPTS_DIR, filename);
    const body = readFileSync(path, 'utf8');
    if (filename === '_designer-system.md') {
      // System prompt keeps its original frontmatter (type: system-prompt etc.).
      expect(body.length, `${filename}: empty file`).toBeGreaterThan(0);
      return;
    }
    const fm = readFrontmatter(body);
    expect(fm.description, `${filename}: missing frontmatter \`description\``).toBeTruthy();
  });

  it('keeps prompts/ flat — Pi does not recurse, so any subdir other than the host-private `_versions/` would be invisible to slash-command discovery', () => {
    const subdirs = readdirSync(PROMPTS_DIR)
      .filter((d) => statSync(join(PROMPTS_DIR, d)).isDirectory())
      // `_versions/` holds `pnpm snap` snapshots; not a Pi prompt template directory.
      .filter((d) => d !== '_versions');
    expect(subdirs).toEqual([]);
  });
});
