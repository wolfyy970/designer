export * from './types.ts';
export * from './stream-budget.ts';
export { emitEvent } from './emit-event.ts';

/**
 * VFS / sandbox primitives exposed on the Pi SDK surface so tool adapters
 * (`pi-bash-tool.ts`, `pi-app-tools.ts`) and a future replacement agent
 * share a single import wall for the workspace contract.
 */
export {
  SANDBOX_PROJECT_ROOT,
  sandboxProjectAbsPath,
  snapshotDesignFiles,
} from '../agent-bash-sandbox.ts';
