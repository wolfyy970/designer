/**
 * Map Pi SDK native filesystem tools to the just-bash virtual tree.
 * All adapter code stays under `pi-sdk/` so the rest of the app stays agent-agnostic.
 */
import path from 'node:path';
import type { Static } from '@sinclair/typebox';
import { minimatch } from 'minimatch';
import type { Bash } from 'just-bash';
import { debugAgentIngest } from '../../lib/debug-agent-ingest.ts';
import { normalizeError } from '../../../src/lib/error-utils.ts';
import { SANDBOX_PROJECT_ROOT } from '../agent-bash-sandbox.ts';
import {
  createReadToolDefinition,
  createWriteToolDefinition,
  createEditToolDefinition,
  createLsToolDefinition,
  createFindToolDefinition,
  grepToolDefinition,
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateLine,
} from './types.ts';
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  GrepToolDetails,
  ToolDefinition,
} from './types.ts';

/** Same default as SDK grep (see `pi-coding-agent` grep tool). */
const GREP_MAX_LINE_LENGTH = 500;
const DEFAULT_GREP_MATCH_LIMIT = 100;
/** Matches Pi read tool line cap (`truncate.js` in pi-coding-agent). */
const SANDBOX_READ_MAX_LINES = 2000;

/**
 * Model-facing `description` for virtual tools on the just-bash workspace.
 *
 * **promptSnippet / promptGuidelines are NOT used here:** Pi's `buildSystemPrompt()` only injects those when
 * no `customPrompt` is set. We pass `designer-agentic-system` as `customPrompt`, so that branch is skipped.
 * Tool descriptions still reach the LLM via the API tool schema (JSON function definitions).
 *
 * Keep in sync with [agent-bash-sandbox.ts](../agent-bash-sandbox.ts) and `<sandbox_environment>` in shared-defaults.
 */
const SANDBOX_TOOL_OVERRIDES = {
  read: {
    description: `Read UTF-8 text from a file in the in-memory project at ${SANDBOX_PROJECT_ROOT}. This workspace is text-only for tool purposes (no image attachments). Output is truncated to ${SANDBOX_READ_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`,
  },
  write: {
    description: `Create or overwrite a UTF-8 text file under ${SANDBOX_PROJECT_ROOT}. Parent directories are created as needed. Use for **new files** or **complete file rewrites**; prefer **edit** for partial changes to existing files.`,
  },
  edit: {
    description: `Apply exact search-and-replace edits to an existing file under ${SANDBOX_PROJECT_ROOT}. Each \`oldText\` must appear **exactly once** in the **original** file before edits are applied. Prefer **edit** over bash/sed for file changes.`,
  },
  ls: {
    description: `List directory contents in the virtual project at ${SANDBOX_PROJECT_ROOT}. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is truncated to 500 entries or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
  },
  find: {
    description: `Search for files by glob pattern under the in-memory project at ${SANDBOX_PROJECT_ROOT}. Returns matching file paths relative to the search directory. There is no .gitignore in this sandbox — every seeded file is visible. Output is truncated to 1000 results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
  },
  grep: {
    description: `Search file contents in the virtual project workspace using ripgrep-style search (just-bash \`rg\`). Returns matching lines with file paths and line numbers. Only the in-memory design files under ${SANDBOX_PROJECT_ROOT} exist — there is no .gitignore or host filesystem. Output is truncated to ${DEFAULT_GREP_MATCH_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars.`,
  },
} as const;

function toProjectRelative(absPath: string): string | null {
  if (!absPath.startsWith(`${SANDBOX_PROJECT_ROOT}/`)) return null;
  return absPath.slice(SANDBOX_PROJECT_ROOT.length + 1);
}

async function emitDesignFileIfNeeded(
  absPath: string,
  bash: Bash,
  onDesignFile: (rel: string, content: string) => void,
): Promise<void> {
  const rel = toProjectRelative(absPath);
  if (!rel) return;
  try {
    const st = await bash.fs.stat(absPath);
    if (!st.isFile) return;
    const content = await bash.fs.readFile(absPath, 'utf8');
    onDesignFile(rel, content);
  } catch {
    /* ignore */
  }
}

function resolveVirtualPath(relativeOrAbsolute: string | undefined, cwd: string): string {
  const raw = (relativeOrAbsolute ?? '.').trim() || '.';
  if (path.posix.isAbsolute(raw)) {
    return path.posix.normalize(raw);
  }
  return path.posix.resolve(cwd, raw);
}

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function createVirtualGrepTool(bash: Bash, sessionCwd: string) {
  const base = grepToolDefinition;
  type GrepParams = Static<(typeof base)['parameters']>;
  return {
    ...base,
    ...SANDBOX_TOOL_OVERRIDES.grep,
    async execute(
      _toolCallId: string,
      params: GrepParams,
      signal: AbortSignal | undefined,
      _onUpdate: AgentToolUpdateCallback<GrepToolDetails | undefined> | undefined,
      _ctx: ExtensionContext,
    ): Promise<AgentToolResult<GrepToolDetails | undefined>> {
      const { pattern, path: pathArg, glob: globPat, ignoreCase, literal, context, limit } = params;

      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }

      const searchPath = resolveVirtualPath(pathArg, sessionCwd);
      try {
        await bash.fs.stat(searchPath);
      } catch {
        return {
          content: [{ type: 'text', text: `Path not found: ${searchPath}` }],
          details: undefined,
        };
      }

      const effectiveLimit = Math.max(1, limit ?? DEFAULT_GREP_MATCH_LIMIT);
      const contextLines = context && context > 0 ? context : 0;

      const argv: string[] = ['rg', '-nH'];
      if (ignoreCase) argv.push('--ignore-case');
      if (literal) argv.push('--fixed-strings');
      if (contextLines > 0) argv.push('-C', String(contextLines));
      const g = globPat?.trim();
      if (g) {
        argv.push('--glob', shellSingleQuote(g));
      }
      /** just-bash `rg` does not support GNU `--` end-of-options; pattern/path are shell-quoted. */
      argv.push(shellSingleQuote(pattern), shellSingleQuote(searchPath));

      const cmd = argv.join(' ');
      const result = await bash.exec(cmd, { signal: signal ?? undefined });

      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }

      if (result.exitCode !== 0 && result.exitCode !== 1) {
        const errText = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
        return {
          content: [
            {
              type: 'text',
              text: errText || `rg failed with exit code ${result.exitCode}`,
            },
          ],
          details: undefined,
        };
      }

      const rawOut = (result.stdout ?? '').replace(/\r\n/g, '\n').trimEnd();
      const stderrTrim = (result.stderr ?? '').trim();
      // Exit 1 usually means "no matches" for rg; non-empty stderr is a real error (e.g. bad flags).
      if (result.exitCode === 1 && !rawOut && stderrTrim) {
        return {
          content: [{ type: 'text', text: stderrTrim }],
          details: undefined,
        };
      }
      if (!rawOut) {
        return {
          content: [{ type: 'text', text: 'No matches found' }],
          details: undefined,
        };
      }

      const lines = rawOut.split('\n');
      const matchLineRe = /^(.+):(\d+):/;
      let matchCount = 0;
      let matchLimitReached = false;
      let linesTruncated = false;
      const kept: string[] = [];

      for (const line of lines) {
        const isMatch = matchLineRe.test(line);
        if (isMatch) {
          if (matchCount >= effectiveLimit) {
            matchLimitReached = true;
            break;
          }
          matchCount++;
        }
        const { text: truncated, wasTruncated } = truncateLine(line, GREP_MAX_LINE_LENGTH);
        if (wasTruncated) linesTruncated = true;
        kept.push(truncated);
      }

      let output = kept.join('\n');
      const truncation = truncateHead(output, { maxLines: Number.MAX_SAFE_INTEGER });
      output = truncation.content;

      const details: {
        matchLimitReached?: number;
        truncation?: ReturnType<typeof truncateHead>;
        linesTruncated?: boolean;
      } = {};

      const notices: string[] = [];
      if (matchLimitReached) {
        notices.push(
          `${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
        );
        details.matchLimitReached = effectiveLimit;
      }
      if (truncation.truncated) {
        notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
        details.truncation = truncation;
      }
      if (linesTruncated) {
        notices.push(
          `Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`,
        );
        details.linesTruncated = true;
      }
      if (notices.length > 0) {
        output += `\n\n[${notices.join('. ')}]`;
      }

      return {
        content: [{ type: 'text', text: output }],
        details: Object.keys(details).length > 0 ? details : undefined,
      };
    },
  } as ToolDefinition;
}

export function createVirtualPiCodingTools(
  bash: Bash,
  onDesignFile: (rel: string, content: string) => void,
) {
  const sessionCwd = SANDBOX_PROJECT_ROOT;

  const readInner = createReadToolDefinition(sessionCwd, {
    autoResizeImages: false,
    operations: {
      readFile: async (absolutePath) => {
        const text = await bash.fs.readFile(absolutePath, 'utf8');
        return Buffer.from(text, 'utf8');
      },
      access: async (absolutePath) => {
        const ok = await bash.fs.exists(absolutePath);
        if (!ok) throw new Error('ENOENT');
      },
    },
  });
  const read = { ...readInner, ...SANDBOX_TOOL_OVERRIDES.read };

  const writeInner = createWriteToolDefinition(sessionCwd, {
    operations: {
      mkdir: async (dir) => {
        await bash.fs.mkdir(dir, { recursive: true });
      },
      writeFile: async (absolutePath, content) => {
        await bash.fs.mkdir(path.posix.dirname(absolutePath), { recursive: true });
        await bash.fs.writeFile(absolutePath, content, 'utf8');
        await emitDesignFileIfNeeded(absolutePath, bash, onDesignFile);
      },
    },
  });
  const write = { ...writeInner, ...SANDBOX_TOOL_OVERRIDES.write };

  const editInner = createEditToolDefinition(sessionCwd, {
    operations: {
      readFile: async (absolutePath) => {
        const text = await bash.fs.readFile(absolutePath, 'utf8');
        return Buffer.from(text, 'utf8');
      },
      writeFile: async (absolutePath, content) => {
        await bash.fs.mkdir(path.posix.dirname(absolutePath), { recursive: true });
        await bash.fs.writeFile(absolutePath, content, 'utf8');
        await emitDesignFileIfNeeded(absolutePath, bash, onDesignFile);
      },
      access: async (absolutePath) => {
        const ok = await bash.fs.exists(absolutePath);
        if (!ok) throw new Error('ENOENT');
      },
    },
  });
  const edit = { ...editInner, ...SANDBOX_TOOL_OVERRIDES.edit };

  const lsInner = createLsToolDefinition(sessionCwd, {
    operations: {
      exists: (absolutePath) => bash.fs.exists(absolutePath),
      stat: async (absolutePath) => {
        const st = await bash.fs.stat(absolutePath);
        return {
          isDirectory: () => st.isDirectory,
        };
      },
      readdir: async (absolutePath) => bash.fs.readdir(absolutePath),
    },
  });

  type LsExecute = (typeof lsInner)['execute'];

  const ls = {
    ...lsInner,
    ...SANDBOX_TOOL_OVERRIDES.ls,
    execute: async (
      toolCallId: string,
      params: Parameters<LsExecute>[1],
      signal: AbortSignal | undefined,
      onUpdate: Parameters<LsExecute>[3],
      extCtx: ExtensionContext,
    ) => {
      const vfsPaths = bash.fs.getAllPaths();
      const pathArg =
        params != null &&
        typeof params === 'object' &&
        'path' in params &&
        typeof (params as { path?: unknown }).path === 'string'
          ? (params as { path: string }).path
          : '';
      const stray = vfsPaths.filter(
        (p) => p !== SANDBOX_PROJECT_ROOT && !p.startsWith(`${SANDBOX_PROJECT_ROOT}/`),
      );
      debugAgentIngest({
        hypothesisId: stray.length > 0 ? 'H5' : 'H4',
        location: 'virtual-tools.ts:ls:enter',
        message: 'virtual ls enter',
        data: {
          sandboxRoot: SANDBOX_PROJECT_ROOT,
          toolCallId,
          pathArg,
          vfsTotal: vfsPaths.length,
          strayCount: stray.length,
          straySample: stray.slice(0, 6),
        },
      });
      const t0 = Date.now();
      try {
        const result = await lsInner.execute(toolCallId, params, signal, onUpdate, extCtx);
        const first = result.content[0];
        const textLen =
          first && typeof first === 'object' && first !== null && 'text' in first
            ? String((first as { text?: unknown }).text ?? '').length
            : 0;
        debugAgentIngest({
          hypothesisId: 'H4',
          location: 'virtual-tools.ts:ls:exit',
          message: 'virtual ls exit',
          data: { toolCallId, durationMs: Date.now() - t0, textLen },
        });
        return result;
      } catch (err) {
        debugAgentIngest({
          hypothesisId: 'H4',
          location: 'virtual-tools.ts:ls:error',
          message: 'virtual ls throw',
          data: { toolCallId, err: normalizeError(err) },
        });
        throw err;
      }
    },
  } as (typeof lsInner);

  const findInner = createFindToolDefinition(sessionCwd, {
    operations: {
      exists: (absolutePath) => bash.fs.exists(absolutePath),
      glob: async (pattern, searchPath, options) => {
        const limit = options.limit;
        const ignore = options.ignore ?? [];
        const prefix = searchPath.endsWith('/') ? searchPath : `${searchPath}/`;
        const allPaths = bash.fs.getAllPaths();
        const out: string[] = [];

        for (const abs of allPaths) {
          if (out.length >= limit) break;
          if (abs === searchPath) continue;
          if (!abs.startsWith(prefix)) continue;

          let st;
          try {
            st = await bash.fs.stat(abs);
          } catch {
            continue;
          }
          if (!st.isFile) continue;

          const rel = abs.startsWith(prefix) ? abs.slice(prefix.length) : abs;
          const ignored = ignore.some((ig) => minimatch(rel, ig, { dot: true }));
          if (ignored) continue;

          if (!minimatch(rel, pattern, { dot: true })) continue;
          out.push(abs);
        }

        return out;
      },
    },
  });
  const find = { ...findInner, ...SANDBOX_TOOL_OVERRIDES.find };

  const grep = createVirtualGrepTool(bash, sessionCwd);

  return [read, write, edit, ls, find, grep];
}
