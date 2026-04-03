/**
 * No-op Pi resource loader so embedded agent sessions do not read the host
 * repo (e.g. CLAUDE.md / AGENTS.md on disk). Virtual tools use just-bash only.
 */
import { type ResourceLoader, createExtensionRuntime } from './pi-sdk/index.ts';

export function createSandboxResourceLoader(): ResourceLoader {
  return {
    async reload() {},
    getExtensions: () => ({
      extensions: [],
      errors: [],
      runtime: createExtensionRuntime(),
    }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => undefined,
    getAppendSystemPrompt: () => [],
    extendResources() {},
  };
}
