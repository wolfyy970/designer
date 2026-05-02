/**
 * Tools registered by the designer Pi extension: todo_write, validate_js, validate_html.
 *
 * VFS-backed tools (read/write/edit/ls/find/grep/bash) stay outside the extension
 * because they need direct access to the per-session bash handle through closures
 * the host builds; the extension factory closes over the same handle to keep the
 * validators colocated with the rest of the designer-specific surface.
 *
 * Tool descriptions name the tool explicitly per Pi anti-pattern guidance ("Use
 * `validate_html` to…", not "this tool…"). Output is bounded so context stays
 * predictable.
 */
import { Type } from 'typebox';
import { Script } from 'node:vm';
import type { Bash } from 'just-bash';
import type { ExtensionContext, ToolDefinition } from '../internal/pi-types.ts';
import { sandboxProjectAbsPath } from '../sandbox/virtual-workspace.ts';
import { validateHtmlWorkspaceContent } from '../internal/html-validation.ts';
import type { TodoItem } from '../types.ts';

async function readProjectFile(bash: Bash, rel: string): Promise<string | undefined> {
  const abs = sandboxProjectAbsPath(rel);
  try {
    if (!(await bash.fs.exists(abs))) return undefined;
    const st = await bash.fs.stat(abs);
    if (!st.isFile) return undefined;
    return await bash.fs.readFile(abs, 'utf8');
  } catch {
    return undefined;
  }
}

async function hasProjectFile(bash: Bash, rel: string): Promise<boolean> {
  const abs = sandboxProjectAbsPath(rel);
  try {
    if (!(await bash.fs.exists(abs))) return false;
    const st = await bash.fs.stat(abs);
    return st.isFile;
  } catch {
    return false;
  }
}

function normalizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// ── todo_write ───────────────────────────────────────────────────────────────

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

export function createTodoWriteTool(
  todoState: { current: TodoItem[] },
  onTodos: (todos: TodoItem[]) => void,
): ToolDefinition {
  return {
    name: 'todo_write',
    label: 'todo_write',
    description:
      'Use `todo_write` to record or update your task list. Always provide the complete current state — full replacement, not incremental updates. Todos survive context compaction.',
    parameters: todoWriteSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx: ExtensionContext) {
      const { todos } = params as { todos: TodoItem[] };
      todoState.current = todos;
      onTodos(todos);
      const summary = todos
        .map((t) => {
          const icon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '●' : '○';
          return `${icon} ${t.task}`;
        })
        .join('\n');
      return {
        content: [{ type: 'text', text: `Todo list updated:\n${summary}` }],
        details: null,
      };
    },
  };
}

// ── validate_js ──────────────────────────────────────────────────────────────

const validateJsSchema = Type.Object({
  path: Type.String({ description: 'Path of the JS file (e.g. "app.js").' }),
});

export function createValidateJsTool(bash: Bash): ToolDefinition {
  return {
    name: 'validate_js',
    label: 'validate_js',
    description:
      'Use `validate_js` to check JavaScript syntax with the Node parser. Prefer running it after substantive edits to catch unbalanced braces, stray punctuation, or invalid syntax before the file goes back into the design.',
    parameters: validateJsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx: ExtensionContext) {
      const { path } = params as { path: string };
      const content = await readProjectFile(bash, path);
      if (content === undefined) {
        return { content: [{ type: 'text', text: `File not found: ${path}` }], details: null };
      }
      try {
        new Script(content, { filename: path });
        return { content: [{ type: 'text', text: `${path}: syntax OK` }], details: null };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `${path}: ${normalizeError(err)}` }],
          details: null,
        };
      }
    },
  };
}

// ── validate_html ────────────────────────────────────────────────────────────

const validateHtmlSchema = Type.Object({
  path: Type.String({ description: 'Path of the HTML file (e.g. "index.html").' }),
});

export function createValidateHtmlTool(bash: Bash): ToolDefinition {
  return {
    name: 'validate_html',
    label: 'validate_html',
    description:
      'Use `validate_html` to run structural checks on an HTML file (DOCTYPE, html/head/body landmarks, balanced script and style tags, local asset references resolve, external refs blocked except the Google Fonts allowlist). Inline CSS and JS are allowed.',
    parameters: validateHtmlSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx: ExtensionContext) {
      const { path } = params as { path: string };
      const content = await readProjectFile(bash, path);
      if (content === undefined) {
        return { content: [{ type: 'text', text: `File not found: ${path}` }], details: null };
      }

      const issues = await validateHtmlWorkspaceContent(content, path, (rel) =>
        hasProjectFile(bash, rel),
      );

      const text =
        issues.length === 0
          ? `${path}: structure OK`
          : `${path}: ${issues.length} issue(s)\n${issues.map((i) => `- ${i}`).join('\n')}`;

      return { content: [{ type: 'text', text }], details: null };
    },
  };
}
