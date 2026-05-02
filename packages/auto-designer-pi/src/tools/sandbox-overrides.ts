/**
 * Model-facing `description` strings for VFS-backed Pi tools.
 *
 * Pi only injects `promptSnippet` / `promptGuidelines` when no `customPrompt` is set;
 * the host always passes the designer system prompt as `customPrompt`, so descriptions
 * here are the only sandbox-specific text the LLM reliably sees via the API tool schema.
 *
 * Keep this in sync with the system prompt's `<sandbox_environment>` section and the
 * tool inventory in ARCHITECTURE.md.
 */
import { DEFAULT_MAX_BYTES } from '../internal/limits.ts';
import { SANDBOX_LIMITS, SANDBOX_READ_MAX_LINES } from '../internal/limits.ts';
import { SANDBOX_PROJECT_ROOT } from '../sandbox/virtual-workspace.ts';

const KB = DEFAULT_MAX_BYTES / 1024;

export const SANDBOX_TOOL_OVERRIDES = {
  read: {
    description: `Read UTF-8 text from a file in the in-memory project at ${SANDBOX_PROJECT_ROOT}. This workspace is text-only for tool purposes (no image attachments). Output is truncated to ${SANDBOX_READ_MAX_LINES} lines or ${KB}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`,
  },
  write: {
    description: `Create or overwrite a UTF-8 text file under ${SANDBOX_PROJECT_ROOT}. Parent directories are created as needed. Use for **new files** or **complete file rewrites**; prefer **edit** for partial changes to existing files.`,
  },
  edit: {
    description: `Apply exact search-and-replace edits to an existing file under ${SANDBOX_PROJECT_ROOT}. Each \`oldText\` must appear **exactly once** in the **original** file before edits are applied. CRITICAL: Include **at least 3 lines of surrounding context** in each \`oldText\` so it uniquely identifies one occurrence — e.g. the full CSS rule block (selector + braces), not a single property line when that value repeats. Prefer **edit** over bash/sed for file changes.`,
  },
  ls: {
    description: `List directory contents in the virtual project at ${SANDBOX_PROJECT_ROOT}. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is truncated to ${SANDBOX_LIMITS.lsMaxEntries} entries or ${KB}KB (whichever is hit first).`,
  },
  find: {
    description: `Search for files by glob pattern under the in-memory project at ${SANDBOX_PROJECT_ROOT}. Returns matching file paths relative to the search directory. There is no .gitignore in this sandbox — every generated file is visible. Output is truncated to ${SANDBOX_LIMITS.findMaxResults} results or ${KB}KB (whichever is hit first).`,
  },
  grep: {
    description: `Search file contents in the virtual project workspace using ripgrep-style search (just-bash \`rg\`). Returns matching lines with file paths and line numbers. Only the in-memory design files under ${SANDBOX_PROJECT_ROOT} exist — there is no .gitignore or host filesystem. Output is truncated to ${SANDBOX_LIMITS.grepDefaultMatchLimit} matches or ${KB}KB (whichever is hit first). Long lines are truncated to ${SANDBOX_LIMITS.grepMaxLineLength} chars.`,
  },
} as const;
