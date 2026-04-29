export * from './types.ts';
export * from './stream-budget.ts';
export { emitEvent } from './emit-event.ts';

/**
 * Backward-compatible VFS exports. New code should import the app-owned
 * workspace contract from `server/services/virtual-workspace.ts`.
 */
export {
  SANDBOX_PROJECT_ROOT,
  sandboxProjectAbsPath,
  snapshotDesignFiles,
} from '../virtual-workspace.ts';
