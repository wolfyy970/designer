/**
 * Per-session designer extension: registers todo_write / validate_js /
 * validate_html / validate_artifact.
 * Closes over the host-built bash sandbox so the validators can read VFS files
 * without going through Pi's tool layer.
 *
 * Compaction uses Pi's built-in defaults — no custom hook here.
 *
 * **Relationship to the production surface:** `host.ts` does not call this
 * factory — it builds `buildDesignToolSurface()`, which registers these same
 * four extension tools *plus* the seven VFS-backed Pi overrides through one
 * `ExtensionFactory`. This helper exists for hosts that want the designer
 * tools without the sandbox overrides.
 *
 * `pi-tool-surface.test.ts` pins both paths to the same four names, because
 * two independent registrations of the same tools can otherwise drift apart
 * silently — this one is not exercised by any production call site.
 */
import type { Bash } from 'just-bash';
import type { ExtensionAPI, ExtensionFactory } from '../internal/pi-types.ts';
import {
  createTodoWriteTool,
  createValidateArtifactTool,
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
    pi.registerTool(createValidateArtifactTool(opts.bash));
  };
}
