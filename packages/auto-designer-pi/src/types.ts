/**
 * Shared types surfaced by the package's session events and tool callbacks.
 * Kept narrow so consumers don't have to depend on the host's wider type tree.
 */

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  id: string;
  task: string;
  status: TodoStatus;
}
