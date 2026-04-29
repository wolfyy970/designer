/**
 * Authoritative virtual workspace contract for agent sessions.
 *
 * This module owns path normalization, seed-file materialization, file-map
 * extraction, and "files beyond seed" semantics for the just-bash workspace.
 * Pi-specific tool adapters may depend on it, but higher-level orchestration
 * should treat these helpers as the app's VFS boundary.
 */
export {
  SANDBOX_PROJECT_ROOT,
  sandboxProjectAbsPath,
  buildSandboxSeedMaps,
  createAgentBashSandbox,
  extractDesignFiles,
  computeDesignFilesBeyondSeed,
  snapshotDesignFiles,
  type AgentBashSandboxOptions,
} from './agent-bash-sandbox.ts';
