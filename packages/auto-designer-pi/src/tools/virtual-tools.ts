/**
 * Map Pi SDK native filesystem tools to a just-bash virtual project tree.
 *
 * The schemas (and thus the JSON function definitions sent to the LLM) come from Pi.
 * `execute` delegates to `bash.fs.*` so the host filesystem is never touched. Tool
 * descriptions are replaced with sandbox-accurate copy via `SANDBOX_TOOL_OVERRIDES`.
 */
import path from 'node:path';
import type { Static } from 'typebox';
import { minimatch } from 'minimatch';
import type { Bash } from 'just-bash';
import {
  DEFAULT_MAX_BYTES,
  SANDBOX_LIMITS,
} from '../internal/limits.ts';
import { SANDBOX_PROJECT_ROOT } from '../sandbox/virtual-workspace.ts';
import {
  createReadToolDefinition,
  createWriteToolDefinition,
  createEditToolDefinition,
  createLsToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  formatSize,
  truncateHead,
  truncateLine,
} from '../internal/pi-types.ts';
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  GrepToolDetails,
  ToolDefinition,
} from '../internal/pi-types.ts';
import {
  attemptMatchCascade,
  isEditNotFoundError,
  normalizeEditToolParams,
  type CascadeDiagnostic,
} from './edit-match-cascade.ts';
import { SANDBOX_TOOL_OVERRIDES } from './sandbox-overrides.ts';

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

/**
 * Resolve a model-supplied path against the sandbox session cwd, and refuse
 * anything that lands outside the project root.
 *
 * The upstream SDK resolves paths with `path.resolve`, which **normalizes** `..`
 * rather than rejecting it — `resolve('/home/user/project', '../evil.html')` is
 * `/home/user/evil.html`. Before this guard, a model writing `../evil.html` (or
 * running `bash: echo x > ../evil.html`) created the file outside the sandbox
 * root while being told it had succeeded. Every consequence was silent:
 *
 *   - `toProjectRelative` returns null, so no `onFile` callback, no `file` SSE
 *     event and no `file_written` trace — the live monitor never showed it;
 *   - `extractDesignFiles` filtered it out of the result map, so a preview
 *     referencing it 404s;
 *   - if it was the run's only write, the result map was empty and
 *     `mapPackageResult` reported `no_files`, **discarding the whole run** as
 *     failed even though the model was told the write worked.
 *
 * Rejecting here makes "the workspace root is the sandbox" true and turns a
 * silent loss into an error the model can act on. `resolve-virtual-asset-path.ts`
 * already applies this containment rule to asset refs; this is the same rule at
 * the tool-path seam, which every file tool routes through.
 */
function resolveVirtualPath(relativeOrAbsolute: string | undefined, cwd: string): string {
  const raw = (relativeOrAbsolute ?? '.').trim() || '.';
  const resolved = path.posix.isAbsolute(raw)
    ? path.posix.normalize(raw)
    : path.posix.resolve(cwd, raw);
  if (resolved !== SANDBOX_PROJECT_ROOT && !resolved.startsWith(`${SANDBOX_PROJECT_ROOT}/`)) {
    throw new Error(
      `Path escapes the sandbox workspace root: ${relativeOrAbsolute ?? ''} ` +
        `(resolved to ${resolved}; the workspace root is ${SANDBOX_PROJECT_ROOT}). ` +
        `Use paths relative to the workspace root.`,
    );
  }
  return resolved;
}

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function createVirtualGrepTool(bash: Bash, sessionCwd: string) {
  /** Pi 0.72 requires `cwd` even though our `execute` overrides it; keeps the parameter schema upstream. */
  const base = createGrepToolDefinition(sessionCwd);
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

      const effectiveLimit = Math.max(1, limit ?? SANDBOX_LIMITS.grepDefaultMatchLimit);
      const contextLines = context && context > 0 ? context : 0;

      const argv: string[] = ['rg', '-nH'];
      if (ignoreCase) argv.push('--ignore-case');
      if (literal) argv.push('--fixed-strings');
      if (contextLines > 0) argv.push('-C', String(contextLines));
      const g = globPat?.trim();
      if (g) {
        argv.push('--glob', shellSingleQuote(g));
      }
      /** just-bash `rg` doesn't support GNU `--` end-of-options; pattern/path are shell-quoted. */
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
            { type: 'text', text: errText || `rg failed with exit code ${result.exitCode}` },
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
        if (matchLineRe.test(line)) {
          if (matchCount >= effectiveLimit) {
            matchLimitReached = true;
            break;
          }
          matchCount++;
        }
        const { text: truncated, wasTruncated } = truncateLine(line, SANDBOX_LIMITS.grepMaxLineLength);
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
          `Some lines truncated to ${SANDBOX_LIMITS.grepMaxLineLength} chars. Use read tool to see full lines`,
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

function resolveSandboxPathForSession(relativeOrAbsolute: string | undefined, cwd: string): string {
  return resolveVirtualPath(relativeOrAbsolute, cwd);
}

/**
 * Per-session state shared across the seven sandboxed Pi tools. `read`, `write`
 * and `edit` cooperate via `pathsSeenBeforeEdit` to enforce the read-before-edit
 * invariant; the bash tool also bumps it when commands modify files. Builders
 * take a `SandboxToolContext` so each builder is independently constructible
 * and the cooperation is explicit, not hidden in a closure scope.
 */
export interface SandboxToolContext {
  readonly bash: Bash;
  readonly sessionCwd: string;
  /** Absolute VFS paths the model has read or written this session (FileTime-style guard). */
  readonly pathsSeenBeforeEdit: Set<string>;
  /** Called with every file the model writes/edits inside the project root. */
  readonly onDesignFile: (rel: string, content: string) => void;
}

export function createSandboxToolContext(
  bash: Bash,
  onDesignFile: (rel: string, content: string) => void,
): SandboxToolContext {
  return {
    bash,
    sessionCwd: SANDBOX_PROJECT_ROOT,
    pathsSeenBeforeEdit: new Set<string>(),
    onDesignFile,
  };
}

export function buildSandboxedReadTool(ctx: SandboxToolContext): ToolDefinition {
  const { bash, sessionCwd, pathsSeenBeforeEdit } = ctx;
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
  type ReadExecute = (typeof readInner)['execute'];
  const read = {
    ...readInner,
    ...SANDBOX_TOOL_OVERRIDES.read,
    execute: async (
      toolCallId: string,
      params: Parameters<ReadExecute>[1],
      signal: Parameters<ReadExecute>[2],
      onUpdate: Parameters<ReadExecute>[3],
      extCtx: Parameters<ReadExecute>[4],
    ) => {
      const result = await readInner.execute(toolCallId, params, signal, onUpdate, extCtx);
      const rawPath =
        params != null &&
        typeof params === 'object' &&
        'path' in params &&
        typeof (params as { path?: unknown }).path === 'string'
          ? (params as { path: string }).path
          : '';
      if (rawPath) {
        pathsSeenBeforeEdit.add(resolveSandboxPathForSession(rawPath, sessionCwd));
      }
      return result;
    },
  } as (typeof readInner);
  return read as unknown as ToolDefinition;
}

/**
 * Containment check for a path the **upstream SDK** has already resolved.
 *
 * `write.js` calls `resolveToCwd(path, cwd)` itself and then hands the result
 * straight to our `operations.writeFile`, so the resolved path never passes
 * through `resolveVirtualPath` — guarding that wrapper (as `edit` and `grep` do)
 * does not cover `write`. `path.resolve` normalizes `..` rather than rejecting
 * it, so `../evil.html` arrived here as `/home/user/evil.html` and was written
 * **outside the workspace root** while the tool replied "Successfully wrote
 * 3 bytes to ../evil.html".
 *
 * Every consequence was silent: `toProjectRelative` returns null so no `onFile`
 * callback fires (no `file` SSE event, no `file_written` trace); `extractDesignFiles`
 * filtered it out of the result map; and if it was the run's only write, the map
 * was empty and `mapPackageResult` reported `no_files`, discarding the entire run
 * as failed even though the model had been told the write succeeded.
 */
function assertInsideSandbox(absPath: string): string {
  const normalized = path.posix.normalize(absPath);
  if (normalized !== SANDBOX_PROJECT_ROOT && !normalized.startsWith(`${SANDBOX_PROJECT_ROOT}/`)) {
    throw new Error(
      `Path escapes the sandbox workspace root: ${absPath} ` +
        `(the workspace root is ${SANDBOX_PROJECT_ROOT}). ` +
        `Use paths relative to the workspace root.`,
    );
  }
  return normalized;
}

export function buildSandboxedWriteTool(ctx: SandboxToolContext): ToolDefinition {
  const { bash, sessionCwd, pathsSeenBeforeEdit, onDesignFile } = ctx;
  const writeInner = createWriteToolDefinition(sessionCwd, {
    operations: {
      mkdir: async (dir) => {
        // The SDK resolves this path on its own; contain it here.
        await bash.fs.mkdir(assertInsideSandbox(dir), { recursive: true });
      },
      writeFile: async (absolutePath, content) => {
        const contained = assertInsideSandbox(absolutePath);
        await bash.fs.mkdir(path.posix.dirname(contained), { recursive: true });
        await bash.fs.writeFile(contained, content, 'utf8');
        await emitDesignFileIfNeeded(contained, bash, onDesignFile);
      },
    },
  });
  type WriteExecute = (typeof writeInner)['execute'];
  const write = {
    ...writeInner,
    ...SANDBOX_TOOL_OVERRIDES.write,
    execute: async (
      toolCallId: string,
      params: Parameters<WriteExecute>[1],
      signal: Parameters<WriteExecute>[2],
      onUpdate: Parameters<WriteExecute>[3],
      extCtx: Parameters<WriteExecute>[4],
    ) => {
      const result = await writeInner.execute(toolCallId, params, signal, onUpdate, extCtx);
      const rawPath =
        params != null &&
        typeof params === 'object' &&
        'path' in params &&
        typeof (params as { path?: unknown }).path === 'string'
          ? (params as { path: string }).path
          : '';
      if (rawPath) {
        pathsSeenBeforeEdit.add(resolveSandboxPathForSession(rawPath, sessionCwd));
      }
      return result;
    },
  } as (typeof writeInner);
  return write as unknown as ToolDefinition;
}

export function buildSandboxedEditTool(ctx: SandboxToolContext): ToolDefinition {
  const { bash, sessionCwd, pathsSeenBeforeEdit, onDesignFile } = ctx;
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
  type EditExecute = (typeof editInner)['execute'];
  const edit = {
    ...editInner,
    ...SANDBOX_TOOL_OVERRIDES.edit,
    execute: async (
      toolCallId: string,
      params: Parameters<EditExecute>[1],
      signal: Parameters<EditExecute>[2],
      onUpdate: Parameters<EditExecute>[3],
      extCtx: Parameters<EditExecute>[4],
    ) => {
      const rawPath =
        params != null &&
        typeof params === 'object' &&
        'path' in params &&
        typeof (params as { path?: unknown }).path === 'string'
          ? (params as { path: string }).path
          : '';
      const abs = resolveSandboxPathForSession(rawPath || '.', sessionCwd);
      const fileExists = await bash.fs.exists(abs);
      if (fileExists && !pathsSeenBeforeEdit.has(abs)) {
        throw new Error(
          `You must read "${rawPath}" before editing it. Use the read tool first to see the current file content.`,
        );
      }
      try {
        return await editInner.execute(toolCallId, params, signal, onUpdate, extCtx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!isEditNotFoundError(msg)) throw err;

        const normalized = normalizeEditToolParams(params);
        if (!normalized) throw err;

        let fileContent: string;
        try {
          fileContent = await bash.fs.readFile(abs, 'utf8');
        } catch {
          throw err;
        }
        const diagnostics: CascadeDiagnostic[] = [];
        const corrected = attemptMatchCascade(fileContent, normalized.edits, diagnostics);
        if (!corrected) throw err;

        const retryParams = {
          path: normalized.path,
          edits: corrected,
        } as Parameters<EditExecute>[1];
        try {
          return await editInner.execute(toolCallId, retryParams, signal, onUpdate, extCtx);
        } catch {
          throw err;
        }
      }
    },
  } as (typeof editInner);
  return edit as unknown as ToolDefinition;
}

export function buildSandboxedLsTool(ctx: SandboxToolContext): ToolDefinition {
  const { bash, sessionCwd } = ctx;
  const lsInner = createLsToolDefinition(sessionCwd, {
    operations: {
      exists: (absolutePath) => bash.fs.exists(absolutePath),
      stat: async (absolutePath) => {
        const st = await bash.fs.stat(absolutePath);
        return { isDirectory: () => st.isDirectory };
      },
      readdir: async (absolutePath) => bash.fs.readdir(absolutePath),
    },
  });
  const ls = { ...lsInner, ...SANDBOX_TOOL_OVERRIDES.ls };
  return ls as unknown as ToolDefinition;
}

export function buildSandboxedFindTool(ctx: SandboxToolContext): ToolDefinition {
  const { bash, sessionCwd } = ctx;
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
          if (ignore.some((ig) => minimatch(rel, ig, { dot: true }))) continue;
          if (!minimatch(rel, pattern, { dot: true })) continue;
          out.push(abs);
        }

        return out;
      },
    },
  });
  const find = { ...findInner, ...SANDBOX_TOOL_OVERRIDES.find };
  return find as unknown as ToolDefinition;
}

export function buildSandboxedGrepTool(ctx: SandboxToolContext): ToolDefinition {
  return createVirtualGrepTool(ctx.bash, ctx.sessionCwd) as unknown as ToolDefinition;
}

/**
 * Convenience wrapper retained for legacy callers/tests: build the six VFS-backed
 * Pi tools (`read`, `write`, `edit`, `ls`, `find`, `grep`) sharing one
 * SandboxToolContext. New code should declare each tool through `ToolSurface`
 * in host.ts using the per-tool builders directly.
 */
export function createVirtualPiCodingTools(
  bash: Bash,
  onDesignFile: (rel: string, content: string) => void,
): ToolDefinition[] {
  const ctx = createSandboxToolContext(bash, onDesignFile);
  return [
    buildSandboxedReadTool(ctx),
    buildSandboxedWriteTool(ctx),
    buildSandboxedEditTool(ctx),
    buildSandboxedLsTool(ctx),
    buildSandboxedFindTool(ctx),
    buildSandboxedGrepTool(ctx),
  ];
}
