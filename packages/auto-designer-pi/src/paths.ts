/**
 * Absolute paths to the package's bundled `skills/`, `prompts/`, and `extensions/`
 * directories — resolved at runtime from `import.meta.url`. Hosts pass these into
 * Pi's `DefaultResourceLoader` so the package's content is discoverable without
 * the host having to figure out where the package lives on disk.
 *
 * Helpers also load the system prompt (`prompts/_designer-system.md`) and the
 * compaction body (`prompts/_internal/compaction.md`) — both with frontmatter
 * stripped — since those are addressed by name, not by Pi's auto-discovery.
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

/** Path to the host-private compaction prompt body (loaded by the compaction handler). */
export const PACKAGE_COMPACTION_PROMPT_PATH = resolve(
  PACKAGE_PROMPTS_DIR,
  '_internal',
  'compaction.md',
);

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
 * Read the compaction prompt body. No frontmatter to strip in `_internal/`,
 * but apply the helper for consistency.
 */
export function loadCompactionPrompt(): string {
  return stripFrontmatter(readFileSync(PACKAGE_COMPACTION_PROMPT_PATH, 'utf8')).trim();
}
