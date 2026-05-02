/**
 * Absolute paths to the package's bundled `skills/`, `prompts/`, and `extensions/`
 * directories — resolved at runtime from `import.meta.url`. Hosts pass these into
 * Pi's `DefaultResourceLoader` so the package's content is discoverable without
 * the host having to figure out where the package lives on disk.
 *
 * `loadDesignerSystemPrompt` reads `prompts/_designer-system.md` (frontmatter
 * stripped) since the system prompt is addressed by name, not by Pi's
 * auto-discovery. Compaction uses Pi's built-in defaults — no host body.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo-relative absolute path to the package root. */
export const PACKAGE_ROOT = resolve(__dirname, '..');

/** Absolute path to the package's bundled skills directory. */
export const PACKAGE_SKILLS_DIR = resolve(PACKAGE_ROOT, 'skills');

/** Absolute path to the package's bundled prompts directory (flat — Pi does NOT recurse). */
export const PACKAGE_PROMPTS_DIR = resolve(PACKAGE_ROOT, 'prompts');

/** Absolute path to the package's bundled extensions directory. */
export const PACKAGE_EXTENSIONS_DIR = resolve(PACKAGE_ROOT, 'extensions');

/** Path to the designer system prompt body (used as `customPrompt` on createAgentSession). */
export const PACKAGE_DESIGNER_SYSTEM_PROMPT_PATH = resolve(PACKAGE_PROMPTS_DIR, '_designer-system.md');

function stripFrontmatter(text: string): string {
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return text;
  return text.slice(end + 4).replace(/^\n+/, '');
}

/**
 * Read the designer system prompt body, with YAML frontmatter stripped.
 * The body is what Pi's `customPrompt` expects.
 */
export function loadDesignerSystemPrompt(): string {
  return stripFrontmatter(readFileSync(PACKAGE_DESIGNER_SYSTEM_PROMPT_PATH, 'utf8')).trim();
}

/**
 * Read a bundled prompt template body by filename (e.g. `gen-hypotheses.md`),
 * with YAML frontmatter stripped. Hosts use this to inject task-specific
 * behavioral guidance into Pi user prompts when a session type is not driven
 * through Pi's `use_skill` flow.
 */
export function loadPackagePromptBody(filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, '');
  const full = resolve(PACKAGE_PROMPTS_DIR, safe);
  return stripFrontmatter(readFileSync(full, 'utf8')).trim();
}
