import type { TodoItem } from '../../../types/provider';

/** Live task checklist shown during agentic generation */
export function TodoTracker({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) return null;
  return (
    <div className="border-b border-border-subtle px-3 py-2 shrink-0">
      <div className="text-[9px] font-medium uppercase tracking-wider text-fg-faint mb-1.5">Tasks</div>
      <div className="flex flex-col gap-0.5">
        {todos.map((todo) => (
          <div key={todo.id} className="flex items-start gap-1.5">
            <span className={`mt-px shrink-0 font-mono text-[10px] leading-tight ${
              todo.status === 'completed' ? 'text-accent' :
              todo.status === 'in_progress' ? 'text-fg-secondary' : 'text-fg-faint'
            }`}>
              {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '●' : '○'}
            </span>
            <span className={`text-[10px] leading-tight ${
              todo.status === 'completed' ? 'text-fg-muted line-through' :
              todo.status === 'in_progress' ? 'text-fg-secondary' : 'text-fg-faint'
            }`}>
              {todo.task}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
