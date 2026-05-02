/**
 * Per-session designer extension: registers todo_write / validate_js / validate_html
 * and the session_before_compact handler. Closes over the host-built bash sandbox
 * so the validators can read VFS files without going through Pi's tool layer.
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
import {
  createDesignerCompactionExtensionFactory,
  type CompactionFocusLoader,
} from './compaction.ts';
import type { TodoItem } from '../types.ts';

export interface DesignerExtensionOptions {
  /** Per-session bash handle (just-bash). The extension closes over it. */
  bash: Bash;
  /** Mutable todo state mirrored from the model's todo_write calls. */
  todoState: { current: TodoItem[] };
  /** Callback invoked every time the model writes the todo list. */
  onTodos: (todos: TodoItem[]) => void;
  /** Optional compaction focus loader. When provided, Pi's compaction runs with this body merged into customInstructions. */
  getCompactionFocus?: CompactionFocusLoader;
}

export function createDesignerExtensionFactory(opts: DesignerExtensionOptions): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    pi.registerTool(createTodoWriteTool(opts.todoState, opts.onTodos));
    pi.registerTool(createValidateJsTool(opts.bash));
    pi.registerTool(createValidateHtmlTool(opts.bash));

    if (opts.getCompactionFocus) {
      // Delegate to the dedicated compaction factory so it stays unit-testable.
      const compactionFactory = createDesignerCompactionExtensionFactory(opts.getCompactionFocus);
      compactionFactory(pi);
    }
  };
}
