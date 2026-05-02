/**
 * Per-session designer extension: registers todo_write / validate_js / validate_html.
 * Closes over the host-built bash sandbox so the validators can read VFS files
 * without going through Pi's tool layer.
 *
 * Compaction uses Pi's built-in defaults — no custom hook here.
 *
 * Use as `extensionFactories: [createDesignerExtensionFactory({ ... })]` on
 * `DefaultResourceLoader` (or its replacement). One factory per session — the
 * factory is invoked once per session by Pi's extension runtime.
 */
import type { Bash } from 'just-bash';
import type { ExtensionAPI, ExtensionFactory } from '../internal/pi-types.ts';
import {
  createTodoWriteTool,
  createValidateHtmlTool,
  createValidateJsTool,
} from './designer-tools.ts';
import type { TodoItem } from '../types.ts';

export interface DesignerExtensionOptions {
  /** Per-session bash handle (just-bash). The extension closes over it. */
  bash: Bash;
  /** Mutable todo state mirrored from the model's todo_write calls. */
  todoState: { current: TodoItem[] };
  /** Callback invoked every time the model writes the todo list. */
  onTodos: (todos: TodoItem[]) => void;
}

export function createDesignerExtensionFactory(opts: DesignerExtensionOptions): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.registerTool(createTodoWriteTool(opts.todoState, opts.onTodos));
    pi.registerTool(createValidateJsTool(opts.bash));
    pi.registerTool(createValidateHtmlTool(opts.bash));
  };
}
