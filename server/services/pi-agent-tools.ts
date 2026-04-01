/**
 * PI agent tool factories and TypeBox schemas (virtual workspace, todos, validation).
 */
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type, type Static } from '@sinclair/typebox';
import { Script } from 'node:vm';
import type { TodoItem } from '../../src/types/provider.ts';
import type { VirtualWorkspace } from './virtual-workspace.ts';

// ── Tool schemas ──────────────────────────────────────────────────────────────

const writeFileSchema = Type.Object({
  path: Type.String({ description: 'File path relative to project root (e.g. index.html, styles.css, app.js).' }),
  content: Type.String({ description: 'Complete file content.' }),
  reasoning: Type.Optional(
    Type.String({ description: 'Brief note on key decisions for this file (optional).' }),
  ),
});

type WriteFileParams = Static<typeof writeFileSchema>;

const editPairSchema = Type.Object({
  oldText: Type.String({ description: 'Exact snippet to replace; must appear exactly once in the file.' }),
  newText: Type.String({ description: 'Replacement text.' }),
});

const editFileSchema = Type.Object({
  path: Type.String({ description: 'File path to edit.' }),
  edits: Type.Optional(
    Type.Array(editPairSchema, {
      description:
        'Multiple disjoint replacements in one call (preferred). Each oldText must appear exactly once. Apply in one batch.',
    }),
  ),
  oldText: Type.Optional(Type.String({ description: 'Legacy: single replacement (use edits[] for multiple).' })),
  newText: Type.Optional(Type.String({ description: 'Legacy: single replacement.' })),
});

type EditFileParams = Static<typeof editFileSchema>;

const readFileSchema = Type.Object({
  path: Type.String({ description: 'File path to read.' }),
  offset: Type.Optional(Type.Number({ description: '1-based line number to start from (default 1).' })),
  limit: Type.Optional(Type.Number({ description: 'Maximum number of lines to return (omit for remainder of file).' })),
});

type ReadFileParams = Static<typeof readFileSchema>;

const planFilesSchema = Type.Object({
  files: Type.Array(Type.String(), {
    description: 'Optional: paths you expect to touch. UI-only hint; you may skip if using todos + tools alone.',
  }),
  reasoning: Type.Optional(
    Type.String({ description: 'Brief note on structure (optional).' }),
  ),
});

type PlanFilesParams = Static<typeof planFilesSchema>;

const lsSchema = Type.Object({
  path: Type.Optional(
    Type.String({
      description: 'Directory prefix to list (e.g. skills, .). Omit or use . for all workspace paths.',
    }),
  ),
});

type LsParams = Static<typeof lsSchema>;

const findSchema = Type.Object({
  pattern: Type.String({
    description: 'Glob pattern on full paths (e.g. "*.css", "**/*.html", "index.*").',
  }),
  path: Type.Optional(Type.String({ description: 'Optional prefix; only paths under this prefix are considered.' })),
  limit: Type.Optional(Type.Number({ description: 'Max results (default 1000).' })),
});

type FindParams = Static<typeof findSchema>;

// ── Tool factories ────────────────────────────────────────────────────────────

export function makeWriteFileTool(
  workspace: VirtualWorkspace,
  onFile: (path: string, content: string) => void,
): AgentTool<typeof writeFileSchema> {
  return {
    name: 'write_file',
    label: 'write_file',
    description:
      'Write or overwrite a complete file. Use for new files or when a full rewrite is warranted. ' +
      'For targeted changes, prefer edit_file. Paths under skills/ are read-only.',
    parameters: writeFileSchema,
    execute: async (_toolCallId, params: WriteFileParams) => {
      return workspace.enqueueMutation(params.path, async () => {
        workspace.write(params.path, params.content);
        onFile(params.path, params.content);
        return {
          content: [{ type: 'text' as const, text: `File written: ${params.path}.` }],
          details: null,
        };
      });
    },
  };
}

export function makeEditFileTool(
  workspace: VirtualWorkspace,
  onFile: (path: string, content: string) => void,
): AgentTool<typeof editFileSchema> {
  return {
    name: 'edit_file',
    label: 'edit_file',
    description:
      'Surgical text replacement(s). Prefer edits[] with multiple disjoint changes in one call. ' +
      'Each oldText must match exactly once. For a single change you may use oldText/newText instead.',
    parameters: editFileSchema,
    execute: async (_toolCallId, params: EditFileParams) => {
      const edits =
        params.edits && params.edits.length > 0
          ? params.edits
          : params.oldText != null && params.newText != null
            ? [{ oldText: params.oldText, newText: params.newText }]
            : [];
      if (edits.length === 0) {
        throw new Error('edit_file requires either edits[] or both oldText and newText.');
      }
      return workspace.enqueueMutation(params.path, async () => {
        const updated = workspace.applyEdits(params.path, edits);
        onFile(params.path, updated);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Edited ${params.path} (${edits.length} replacement${edits.length === 1 ? '' : 's'}).`,
            },
          ],
          details: null,
        };
      });
    },
  };
}

export function makeLsTool(workspace: VirtualWorkspace): AgentTool<typeof lsSchema> {
  return {
    name: 'ls',
    label: 'ls',
    description:
      'List paths in the virtual workspace. Optional path prefix filters to that directory (e.g. skills).',
    parameters: lsSchema,
    execute: async (_toolCallId, params: LsParams) => {
      const text = workspace.list(params.path);
      return {
        content: [{ type: 'text' as const, text }],
        details: null,
      };
    },
  };
}

export function makeFindTool(workspace: VirtualWorkspace): AgentTool<typeof findSchema> {
  return {
    name: 'find',
    label: 'find',
    description: 'Find workspace paths matching a glob pattern. Useful to discover files before reading or editing.',
    parameters: findSchema,
    execute: async (_toolCallId, params: FindParams) => {
      const limit = params.limit ?? 1000;
      const found = workspace.find(params.pattern, params.path, limit);
      const text =
        found.length > 0
          ? found.join('\n') + (found.length >= limit ? `\n[${limit} result limit reached]` : '')
          : `No paths match pattern: ${params.pattern}`;
      return {
        content: [{ type: 'text' as const, text }],
        details: null,
      };
    },
  };
}

export function makePlanFilesTool(
  onPlan: (files: string[]) => void,
): AgentTool<typeof planFilesSchema> {
  return {
    name: 'plan_files',
    label: 'plan_files',
    description:
      'Optional: register expected artifact paths for UI progress. You can skip this and rely on todo_write + tools.',
    parameters: planFilesSchema,
    execute: async (_toolCallId, params: PlanFilesParams) => {
      onPlan(params.files);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Plan registered (${params.files.length} path(s)). Continue with read/grep/edit/write as needed.`,
          },
        ],
        details: null,
      };
    },
  };
}

export function makeReadFileTool(workspace: VirtualWorkspace): AgentTool<typeof readFileSchema> {
  return {
    name: 'read_file',
    label: 'read_file',
    description:
      'Read file contents from the workspace. Use offset/limit to page through large files. Lines are numbered as line|text.',
    parameters: readFileSchema,
    execute: async (_toolCallId, params: ReadFileParams) => {
      const { text } = workspace.read(params.path, {
        offset: params.offset,
        limit: params.limit,
      });
      return {
        content: [{ type: 'text' as const, text }],
        details: null,
      };
    },
  };
}

const todoWriteSchema = Type.Object({
  todos: Type.Array(
    Type.Object({
      id: Type.String({ description: 'Unique id (e.g. "1", "2").' }),
      task: Type.String({ description: 'Task description.' }),
      status: Type.Union([
        Type.Literal('pending'),
        Type.Literal('in_progress'),
        Type.Literal('completed'),
      ]),
    }),
    { description: 'Full replacement todo list. Always write the complete current state.' },
  ),
});

type TodoWriteParams = Static<typeof todoWriteSchema>;

const grepSchema = Type.Object({
  pattern: Type.String({ description: 'Regex pattern (or literal if literal=true).' }),
  path: Type.Optional(Type.String({ description: 'Scope to one file, or a path prefix for directory-style filtering.' })),
  glob: Type.Optional(
    Type.String({ description: 'Only search files whose path matches this glob (e.g. "*.css").' }),
  ),
  ignoreCase: Type.Optional(Type.Boolean({ description: 'Case-insensitive search (default false).' })),
  literal: Type.Optional(Type.Boolean({ description: 'Treat pattern as fixed string (default false).' })),
  context: Type.Optional(Type.Number({ description: 'Lines of context before/after each match (default 0).' })),
  limit: Type.Optional(Type.Number({ description: 'Max matches (default 100).' })),
});

type GrepParams = Static<typeof grepSchema>;

export function makeTodoWriteTool(
  todoState: { current: TodoItem[] },
  onTodos: (todos: TodoItem[]) => void,
): AgentTool<typeof todoWriteSchema> {
  return {
    name: 'todo_write',
    label: 'todo_write',
    description:
      'Write or update your task list. Always provide the complete current state — this is a full replacement, not an append. ' +
      'Your todo list survives context compaction and tells you exactly where you left off after a checkpoint.',
    parameters: todoWriteSchema,
    execute: async (_toolCallId, params: TodoWriteParams) => {
      todoState.current = params.todos;
      onTodos(params.todos);
      const summary = params.todos
        .map((t) => {
          const icon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '●' : '○';
          return `${icon} ${t.task}`;
        })
        .join('\n');
      return {
        content: [{ type: 'text' as const, text: `Todo list updated:\n${summary}` }],
        details: null,
      };
    },
  };
}

export function makeGrepTool(workspace: VirtualWorkspace): AgentTool<typeof grepSchema> {
  return {
    name: 'grep',
    label: 'grep',
    description:
      'Search file contents line-by-line. Supports regex or literal, optional glob filter on paths, line context, and match limits.',
    parameters: grepSchema,
    execute: async (_toolCallId, params: GrepParams) => {
      const result = workspace.grepContent({
        pattern: params.pattern,
        path: params.path,
        glob: params.glob,
        ignoreCase: params.ignoreCase,
        literal: params.literal,
        context: params.context,
        limit: params.limit,
      });
      if (!result.ok) {
        return {
          content: [{ type: 'text' as const, text: result.error }],
          details: null,
        };
      }
      return {
        content: [{ type: 'text' as const, text: result.text }],
        details: null,
      };
    },
  };
}

const validateJsSchema = Type.Object({
  path: Type.String({ description: 'Path of the JS file to check (e.g. "app.js").' }),
});

type ValidateJsParams = Static<typeof validateJsSchema>;

const validateHtmlSchema = Type.Object({
  path: Type.String({ description: 'Path of the HTML file to check (e.g. "index.html").' }),
});

type ValidateHtmlParams = Static<typeof validateHtmlSchema>;

export function makeValidateJsTool(
  workspace: VirtualWorkspace,
): AgentTool<typeof validateJsSchema> {
  return {
    name: 'validate_js',
    label: 'validate_js',
    description:
      'Review tool: check JS syntax with the Node parser. Prefer after substantive edits.',
    parameters: validateJsSchema,
    execute: async (_toolCallId, params: ValidateJsParams) => {
      const content = workspace.get(params.path);
      if (content === undefined) {
        return {
          content: [{ type: 'text' as const, text: `File not found: ${params.path}` }],
          details: null,
        };
      }
      try {
        new Script(content, { filename: params.path });
        return {
          content: [{ type: 'text' as const, text: `${params.path}: syntax OK` }],
          details: null,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `${params.path}: ${msg}` }],
          details: null,
        };
      }
    },
  };
}

export function makeValidateHtmlTool(
  workspace: VirtualWorkspace,
): AgentTool<typeof validateHtmlSchema> {
  return {
    name: 'validate_html',
    label: 'validate_html',
    description:
      'Review tool: structural checks for entry HTML (local linked assets, no inline style/script blocks).',
    parameters: validateHtmlSchema,
    execute: async (_toolCallId, params: ValidateHtmlParams) => {
      const content = workspace.get(params.path);
      if (content === undefined) {
        return {
          content: [{ type: 'text' as const, text: `File not found: ${params.path}` }],
          details: null,
        };
      }

      const issues: string[] = [];

      if (!/<!DOCTYPE\s+html/i.test(content)) {
        issues.push('Missing DOCTYPE declaration');
      }

      for (const tag of ['html', 'head', 'body']) {
        if (!new RegExp(`<${tag}[\\s>]`, 'i').test(content)) {
          issues.push(`Missing <${tag}> tag`);
        }
      }

      const scriptOpen = (content.match(/<script/gi) ?? []).length;
      const scriptClose = (content.match(/<\/script>/gi) ?? []).length;
      if (scriptOpen !== scriptClose) {
        issues.push(`Unbalanced <script> tags: ${scriptOpen} opening, ${scriptClose} closing`);
      }

      const styleOpen = (content.match(/<style/gi) ?? []).length;
      const styleClose = (content.match(/<\/style>/gi) ?? []).length;
      if (styleOpen !== styleClose) {
        issues.push(`Unbalanced <style> tags: ${styleOpen} opening, ${styleClose} closing`);
      }

      const inlineStyles = content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? [];
      if (inlineStyles.some((m) => m.replace(/<style[^>]*>/i, '').replace(/<\/style>/i, '').trim())) {
        issues.push('Inline <style> content found — move styles into linked local CSS files');
      }

      const inlineScripts = content.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
      if (inlineScripts.some((m) => m.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim())) {
        issues.push('Inline <script> content found — move scripts into linked local JS files');
      }

      const normalizeAssetRef = (rawRef: string): string => rawRef.split('#')[0]!.split('?')[0]!.replace(/^\.\//, '');
      const classifyRef = (rawRef: string): 'external' | 'absolute' | 'relative' => {
        if (/^(https?:)?\/\//i.test(rawRef) || rawRef.startsWith('data:')) return 'external';
        if (rawRef.startsWith('/')) return 'absolute';
        return 'relative';
      };
      const stylesheetRefs = [...content.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi)]
        .map((match) => match[1] ?? '');
      const scriptRefs = [...content.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)]
        .map((match) => match[1] ?? '');
      for (const ref of [...stylesheetRefs, ...scriptRefs]) {
        const kind = classifyRef(ref);
        if (kind === 'external') {
          issues.push(`External asset reference found: ${ref}`);
          continue;
        }
        if (kind === 'absolute') {
          issues.push(`Use relative asset paths instead of root-absolute paths: ${ref}`);
          continue;
        }
        const normalized = normalizeAssetRef(ref);
        if (!normalized) continue;
        if (!workspace.has(normalized)) {
          issues.push(`Referenced asset not found in workspace: ${ref}`);
        }
      }

      const text =
        issues.length === 0
          ? `${params.path}: structure OK`
          : `${params.path}: ${issues.length} issue(s)\n${issues.map((i) => `- ${i}`).join('\n')}`;

      return {
        content: [{ type: 'text' as const, text }],
        details: null,
      };
    },
  };
}

