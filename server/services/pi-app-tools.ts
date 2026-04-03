/**
 * App-specific Pi SDK tools (todo + validators) reading the just-bash project tree.
 */
import { Type } from '@sinclair/typebox';
import { Script } from 'node:vm';
import type { Bash } from 'just-bash';
import type { ExtensionContext, ToolDefinition } from './pi-sdk/types.ts';
import type { TodoItem } from '../../src/types/provider.ts';
import { SANDBOX_PROJECT_ROOT } from './agent-bash-sandbox.ts';

function projectAbsPath(rel: string): string {
  const t = rel.replace(/^\/+/, '');
  return `${SANDBOX_PROJECT_ROOT}/${t}`;
}

async function readProjectFile(bash: Bash, rel: string): Promise<string | undefined> {
  const abs = projectAbsPath(rel);
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
  const abs = projectAbsPath(rel);
  try {
    if (!(await bash.fs.exists(abs))) return false;
    const st = await bash.fs.stat(abs);
    return st.isFile;
  } catch {
    return false;
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
      'Write or update your task list. Always provide the complete current state — full replacement. ' +
      'Todos survive context compaction.',
    parameters: todoWriteSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx: ExtensionContext) {
      const { todos } = params as { todos: TodoItem[] };
      todoState.current = todos;
      onTodos(todos);
      const summary = todos
        .map((t: TodoItem) => {
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
    description: 'Check JS syntax with the Node parser. Prefer after substantive edits.',
    parameters: validateJsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx: ExtensionContext) {
      const { path } = params as { path: string };
      const content = await readProjectFile(bash, path);
      if (content === undefined) {
        return {
          content: [{ type: 'text', text: `File not found: ${path}` }],
          details: null,
        };
      }
      try {
        new Script(content, { filename: path });
        return {
          content: [{ type: 'text', text: `${path}: syntax OK` }],
          details: null,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `${path}: ${msg}` }],
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
      'Structural checks for entry HTML (local linked assets, no inline style/script blocks).',
    parameters: validateHtmlSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx: ExtensionContext) {
      const { path } = params as { path: string };
      const content = await readProjectFile(bash, path);
      if (content === undefined) {
        return {
          content: [{ type: 'text', text: `File not found: ${path}` }],
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

      const normalizeAssetRef = (rawRef: string): string =>
        rawRef.split('#')[0]!.split('?')[0]!.replace(/^\.\//, '');
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
        if (!(await hasProjectFile(bash, normalized))) {
          issues.push(`Referenced asset not found in workspace: ${ref}`);
        }
      }

      const text =
        issues.length === 0
          ? `${path}: structure OK`
          : `${path}: ${issues.length} issue(s)\n${issues.map((i) => `- ${i}`).join('\n')}`;

      return {
        content: [{ type: 'text', text }],
        details: null,
      };
    },
  };
}
