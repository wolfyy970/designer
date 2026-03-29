/**
 * PI agent tool factories and TypeBox schemas (virtual FS, todos, validation).
 */
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type, type Static } from '@sinclair/typebox';
import { Script } from 'node:vm';
import type { TodoItem } from '../../src/types/provider.ts';

// ── Tool schemas ──────────────────────────────────────────────────────────────

const writeFileSchema = Type.Object({
  path: Type.String({ description: 'File path relative to project root (e.g. index.html, styles.css, app.js).' }),
  content: Type.String({ description: 'Complete file content.' }),
  reasoning: Type.Optional(
    Type.String({ description: 'Brief note on key decisions for this file (optional).' }),
  ),
});

type WriteFileParams = Static<typeof writeFileSchema>;

const editFileSchema = Type.Object({
  path: Type.String({ description: 'File path to edit.' }),
  oldText: Type.String({ description: 'The exact text to replace. Must appear exactly once in the file.' }),
  newText: Type.String({ description: 'The replacement text.' }),
});

type EditFileParams = Static<typeof editFileSchema>;

const readFileSchema = Type.Object({
  path: Type.String({ description: 'File path to read.' }),
});

type ReadFileParams = Static<typeof readFileSchema>;

const planFilesSchema = Type.Object({
  files: Type.Array(Type.String(), {
    description: 'Ordered list of file paths you plan to create (e.g. ["index.html", "styles.css", "app.js"]).',
  }),
  reasoning: Type.Optional(
    Type.String({ description: 'Brief note on the project structure and why (optional).' }),
  ),
});

type PlanFilesParams = Static<typeof planFilesSchema>;

const listFilesSchema = Type.Object({});

// ── Tool factories ────────────────────────────────────────────────────────────

export function makeWriteFileTool(
  virtualFS: Map<string, string>,
  onFile: (path: string, content: string) => void,
): AgentTool<typeof writeFileSchema> {
  return {
    name: 'write_file',
    label: 'write_file',
    description:
      'Write or overwrite a complete file. Use for new files or when a full rewrite is warranted. ' +
      'For targeted changes to an existing file, prefer edit_file instead.',
    parameters: writeFileSchema,
    execute: async (_toolCallId, params: WriteFileParams) => {
      virtualFS.set(params.path, params.content);
      onFile(params.path, params.content);
      return {
        content: [{ type: 'text' as const, text: `File written: ${params.path}.` }],
        details: null,
      };
    },
  };
}

export function makeEditFileTool(
  virtualFS: Map<string, string>,
  onFile: (path: string, content: string) => void,
): AgentTool<typeof editFileSchema> {
  return {
    name: 'edit_file',
    label: 'edit_file',
    description:
      'Make a surgical text replacement in an existing file. ' +
      'oldText must match exactly and appear exactly once in the file. ' +
      'Prefer this over write_file for targeted changes during the self-critique pass.',
    parameters: editFileSchema,
    execute: async (_toolCallId, params: EditFileParams) => {
      const content = virtualFS.get(params.path);
      if (content === undefined) {
        throw new Error(`File not found: ${params.path}. Use write_file to create it first.`);
      }
      const occurrences = content.split(params.oldText).length - 1;
      if (occurrences === 0) {
        throw new Error(`Text not found in ${params.path}. Check that oldText matches exactly.`);
      }
      if (occurrences > 1) {
        throw new Error(
          `Found ${occurrences} matches in ${params.path}. Make oldText more specific to target exactly one location.`,
        );
      }
      const updated = content.replace(params.oldText, params.newText);
      virtualFS.set(params.path, updated);
      onFile(params.path, updated);
      return {
        content: [{ type: 'text' as const, text: `Edited ${params.path}.` }],
        details: null,
      };
    },
  };
}

export function makeListFilesTool(
  virtualFS: Map<string, string>,
): AgentTool<typeof listFilesSchema> {
  return {
    name: 'ls_files',
    label: 'ls_files',
    description: 'List all files you have written so far.',
    parameters: listFilesSchema,
    execute: async () => {
      const files = [...virtualFS.keys()];
      const text =
        files.length > 0 ? `Files written:\n${files.join('\n')}` : 'No files written yet.';
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
      'Declare the files you plan to create before writing any of them. ' +
      'Call this once at the start. The user sees this plan immediately so they know what to expect.',
    parameters: planFilesSchema,
    execute: async (_toolCallId, params: PlanFilesParams) => {
      onPlan(params.files);
      return {
        content: [{ type: 'text' as const, text: `Plan registered: ${params.files.join(', ')}. Now write each file with write_file.` }],
        details: null,
      };
    },
  };
}

export function makeReadFileTool(virtualFS: Map<string, string>): AgentTool<typeof readFileSchema> {
  return {
    name: 'read_file',
    label: 'read_file',
    description: 'Read a file you previously wrote to review or verify it before refining.',
    parameters: readFileSchema,
    execute: async (_toolCallId, params: ReadFileParams) => {
      const content = virtualFS.get(params.path);
      return {
        content: [{ type: 'text' as const, text: content ?? `File not found: ${params.path}` }],
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
  pattern: Type.String({ description: 'Regex pattern to search for.' }),
  path: Type.Optional(Type.String({ description: 'Specific file to search. If omitted, searches all files.' })),
  ignoreCase: Type.Optional(Type.Boolean({ description: 'Case-insensitive search (default false).' })),
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

export function makeGrepTool(
  virtualFS: Map<string, string>,
): AgentTool<typeof grepSchema> {
  return {
    name: 'grep',
    label: 'grep',
    description:
      'Search file contents by regex pattern. Useful for finding specific values (colors, class names, selectors) ' +
      'without reading entire files. Returns file:line: match format. Max 50 matches.',
    parameters: grepSchema,
    execute: async (_toolCallId, params: GrepParams) => {
      let regex: RegExp;
      try {
        regex = new RegExp(params.pattern, params.ignoreCase ? 'i' : '');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Invalid regex pattern: ${msg}` }],
          details: null,
        };
      }

      const MAX_MATCHES = 50;
      const MAX_LINE_LEN = 200;
      const results: string[] = [];

      const entriesToSearch: [string, string][] = params.path
        ? virtualFS.has(params.path)
          ? [[params.path, virtualFS.get(params.path)!]]
          : []
        : [...virtualFS.entries()];

      for (const [filePath, content] of entriesToSearch) {
        if (results.length >= MAX_MATCHES) break;
        const lines = content.split('\n');
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          if (results.length >= MAX_MATCHES) break;
          const line = lines[lineNum];
          if (regex.test(line)) {
            const truncated = line.length > MAX_LINE_LEN ? line.slice(0, MAX_LINE_LEN) + '…' : line;
            results.push(`${filePath}:${lineNum + 1}: ${truncated}`);
          }
        }
      }

      const text =
        results.length > 0
          ? results.join('\n') + (results.length === MAX_MATCHES ? '\n[50 match limit reached]' : '')
          : `No matches found for pattern: ${params.pattern}`;

      return {
        content: [{ type: 'text' as const, text }],
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
  virtualFS: Map<string, string>,
): AgentTool<typeof validateJsSchema> {
  return {
    name: 'validate_js',
    label: 'validate_js',
    description:
      'Check a JS file for syntax errors using the Node.js parser. ' +
      'Returns "syntax OK" or the exact error with line and column number. ' +
      'Call this at the start of the self-critique pass before reading or editing.',
    parameters: validateJsSchema,
    execute: async (_toolCallId, params: ValidateJsParams) => {
      const content = virtualFS.get(params.path);
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
  virtualFS: Map<string, string>,
): AgentTool<typeof validateHtmlSchema> {
  return {
    name: 'validate_html',
    label: 'validate_html',
    description:
      'Check an HTML file for structural issues: missing DOCTYPE, missing tags, ' +
      'unbalanced script/style tags, inline style/script content, missing CSS/JS references. ' +
      'Call this at the start of the self-critique pass before reading or editing.',
    parameters: validateHtmlSchema,
    execute: async (_toolCallId, params: ValidateHtmlParams) => {
      const content = virtualFS.get(params.path);
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

      // Detect inline <style> blocks with actual content
      const inlineStyles = content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? [];
      if (inlineStyles.some((m) => m.replace(/<style[^>]*>/i, '').replace(/<\/style>/i, '').trim())) {
        issues.push('Inline <style> content found — move styles to styles.css');
      }

      // Detect inline <script> blocks with actual content
      const inlineScripts = content.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
      if (inlineScripts.some((m) => m.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim())) {
        issues.push('Inline <script> content found — move scripts to app.js');
      }

      if (!/href=["']\.?\/?(styles\.css)["']/i.test(content)) {
        issues.push('Missing <link rel="stylesheet" href="styles.css">');
      }

      if (!/src=["']\.?\/?(app\.js)["']/i.test(content)) {
        issues.push('Missing <script src="app.js">');
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
