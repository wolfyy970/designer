/**
 * Absolute paths to the package's bundled `skills/`, `prompts/`, and `extensions/`
 * directories — resolved at runtime from `import.meta.url`. Hosts pass these into
 * Pi's `DefaultResourceLoader` so the package's content is discoverable without
 * the host having to figure out where the package lives on disk.
 *
 * `loadDesignerSystemPrompt` reads `prompts/_designer-system.md` (frontmatter
 * stripped) since the system prompt is addressed by name, not by Pi's
 * auto-discovery. `loadPackagePromptBody(filename)` reads any other bundled
 * prompt template body (also frontmatter stripped) so host routes can inline
 * task-specific guidance into agent user prompts.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Locate the package root across three runtimes:
 *   1. Source execution (`tsx`, vitest from repo root): `resolve(__dirname, '..')`
 *      points at `packages/auto-designer-pi/src/..` = the package root.
 *   2. Vercel function bundle: the bundle inlines `paths.ts` so `__dirname`
 *      becomes `/var/task/api`. Fall back to `process.cwd()/packages/auto-designer-pi`,
 *      which Vercel's `includeFiles` ships at deploy time.
 *   3. Package-local tests (`cd packages/auto-designer-pi && pnpm vitest run`):
 *      `process.cwd()` is the package itself.
 *
 * The first candidate that contains `prompts/_designer-system.md` wins; later
 * lookups use the cached path.
 */
function locatePackageRoot(): string {
  const candidates = [
    resolve(__dirname, '..'),
    resolve(process.cwd(), 'packages', 'auto-designer-pi'),
    process.cwd(),
  ];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'prompts', '_designer-system.md'))) {
      return candidate;
    }
  }
  return candidates[0]!;
}

/** Repo-relative absolute path to the package root. */
export const PACKAGE_ROOT = locatePackageRoot();

/** Absolute path to the package's bundled skills directory. */
export const PACKAGE_SKILLS_DIR = resolve(PACKAGE_ROOT, 'skills');

/** Absolute path to the package's bundled prompts directory (flat — Pi does NOT recurse). */
export const PACKAGE_PROMPTS_DIR = resolve(PACKAGE_ROOT, 'prompts');

/** Absolute path to the package's bundled extensions directory. */
export const PACKAGE_EXTENSIONS_DIR = resolve(PACKAGE_ROOT, 'extensions');

/** Path to the designer system prompt body (used as `customPrompt` on createAgentSession). */
export const PACKAGE_DESIGNER_SYSTEM_PROMPT_PATH = resolve(PACKAGE_PROMPTS_DIR, '_designer-system.md');

/**
 * Split YAML frontmatter from a markdown file body. The single implementation
 * for both the bundled prompts (this module) and the host's skill loader
 * (`server/lib/frontmatter-split.ts` delegates here).
 *
 * There used to be four parsers with two semantics, and the one feeding the
 * **system prompt** was the least careful: it tested `text.startsWith('---')`
 * with no BOM strip and searched for `indexOf('\n---', 3)`.
 *
 * Consequences, all silent, all in the path that decides what the model is told:
 *
 *   - **UTF-8 BOM** — `readFileSync(…, 'utf8')` keeps it, so `startsWith('---')`
 *     is false and the raw YAML header is returned as the prompt body. The
 *     system prompt gained ~333 characters of metadata (`name:`, `type:`,
 *     `description:`) on every session. Verified by reproduction.
 *   - **CRLF** — no `\n---` match, so the frontmatter was not stripped and the
 *     body kept stray `\r` characters.
 *   - **`----`** — `indexOf('\n---')` matches the leading three of four dashes,
 *     truncating the body to a single `-`.
 *
 * The rules here are deliberately strict, matching the server's existing
 * semantics: the opening fence must be the first line and exactly `---`, the
 * closing fence must be a line that trims to exactly `---`, and CRLF is
 * normalized. Unterminated frontmatter is returned verbatim as body rather than
 * guessed at, so a malformed file is visible in the prompt instead of silently
 * halved.
 */
export function parseFrontmatter(raw: string): { yaml: string | undefined; body: string } {
  // Strip a UTF-8 BOM and normalize line endings before looking for fences.
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return { yaml: undefined, body: text };

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { yaml: undefined, body: text };

  return {
    yaml: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n').replace(/^\n+/, ''),
  };
}

/** Frontmatter-stripped body, for callers that do not need the metadata. */
export function stripFrontmatter(text: string): string {
  return parseFrontmatter(text).body;
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
