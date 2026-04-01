import { WorkspaceSnapshotSchema } from './workspace-snapshot-schema';

/** Client dev-only: log if snapshot does not match wire schema (no throw). */
export function warnIfWorkspaceSnapshotInvalid(snapshot: unknown, context: string): void {
  if (!import.meta.env.DEV) return;
  const r = WorkspaceSnapshotSchema.safeParse(snapshot);
  if (!r.success) {
    console.warn(`[${context}] workspace snapshot shape unexpected`, r.error.flatten());
  }
}
