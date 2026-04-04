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
      let st;
      try {
        st = await bash.fs.stat(searchPath);
      } catch {
        return {
          content: [{ type: 'text', text: `Path not found: ${searchPath}` }],
          details: undefined,
        };
      }

      const effectiveLimit = Math.max(1, limit ?? DEFAULT_GREP_MATCH_LIMIT);
      const contextLines = context && context > 0 ? context : 0;

      const argv: string[] = ['grep', '-nH', '-I'];
      if (ignoreCase) argv.push('-i');
      if (literal) argv.push('-F');
      else argv.push('-E');
      if (contextLines > 0) argv.push('-C', String(contextLines));
      if (st.isDirectory) {
        argv.push('-r');
      }
      const g = globPat?.trim();
      if (g) {
        argv.push(`--include=${shellSingleQuote(g)}`);
      }
      argv.push('--', shellSingleQuote(pattern), shellSingleQuote(searchPath));

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
              text: errText || `grep failed with exit code ${result.exitCode}`,
            },
          ],
          details: undefined,
        };
      }

      const rawOut = (result.stdout ?? '').replace(/\r\n/g, '\n').trimEnd();
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

  const read = createReadToolDefinition(sessionCwd, {
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

  const write = createWriteToolDefinition(sessionCwd, {
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

  const edit = createEditToolDefinition(sessionCwd, {
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

  const find = createFindToolDefinition(sessionCwd, {
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

  const grep = createVirtualGrepTool(bash, sessionCwd);

  return [read, write, edit, ls, find, grep];
}
