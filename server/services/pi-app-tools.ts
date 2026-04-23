/**
 * App-specific Pi SDK tools (todo + validators) reading the just-bash project tree.
 */
import { Type } from '@sinclair/typebox';
import { Script } from 'node:vm';
import type { Bash } from 'just-bash';
import type { ExtensionContext, ToolDefinition } from './pi-sdk/types.ts';
import type { TodoItem } from '../../src/types/provider.ts';
import { sandboxProjectAbsPath } from './pi-sdk/index.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { buildUseSkillToolDescription } from '../lib/skill-discovery.ts';
import { validateHtmlWorkspaceContent } from './html-validation.ts';
import { piToolParams } from './pi-tool-params.ts';
import type { SkillCatalogEntry } from '../lib/skill-schema.ts';

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
    promptSnippet: 'Track task progress (survives context compaction)',
    parameters: todoWriteSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx: ExtensionContext) {
      const { todos } = piToolParams<{ todos: TodoItem[] }>(params);
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

// ── use_skill (repo Agent Skills; catalog in tool description) ─────────────

const useSkillSchema = Type.Object({
  name: Type.String({
    description: 'Skill key — directory name under skills/ (matches <skill key="..."> in this tool description).',
  }),
});

export function createUseSkillTool(
  entries: SkillCatalogEntry[],
  onActivate: (payload: { key: string; name: string; description: string }) => void,
): ToolDefinition {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const rows = entries.map((e) => ({
    key: e.key,
    name: e.name,
    description: e.description,
  }));
  const description = buildUseSkillToolDescription(rows);

  return {
    name: 'use_skill',
    label: 'use_skill',
    description,
    promptSnippet: 'Load skill instructions from the skills catalog',
    parameters: useSkillSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx: ExtensionContext) {
      const { name } = piToolParams<{ name: string }>(params);
      const key = name.trim();
      const skill = byKey.get(key);
      if (!skill) {
        const available = [...byKey.keys()].sort().join(', ') || '(none)';
        return {
          content: [{ type: 'text', text: `Unknown skill: ${key}. Available: ${available}` }],
          details: null,
        };
      }
      onActivate({
        key: skill.key,
        name: skill.name,
        description: skill.description,
      });
      const header = `# ${skill.name}\n\n`;
      return {
        content: [{ type: 'text', text: header + skill.bodyMarkdown }],
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
    promptSnippet: 'Check JS syntax with Node parser',
    parameters: validateJsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx: ExtensionContext) {
      const { path } = piToolParams<{ path: string }>(params);
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
        const msg = normalizeError(err);
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
      'Structural checks for HTML (DOCTYPE, landmark tags, balanced script/style, local asset refs — inline CSS/JS allowed).',
    promptSnippet: 'Structural checks for HTML (DOCTYPE, landmarks, assets)',
    parameters: validateHtmlSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx: ExtensionContext) {
      const { path } = piToolParams<{ path: string }>(params);
      const content = await readProjectFile(bash, path);
      if (content === undefined) {
        return {
          content: [{ type: 'text', text: `File not found: ${path}` }],
          details: null,
        };
      }

      const issues = await validateHtmlWorkspaceContent(content, path, (rel) => hasProjectFile(bash, rel));

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
