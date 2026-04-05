/**
 * Pi resource loader for embedded agent sessions: does not read the host repo
 * (e.g. CLAUDE.md / AGENTS.md on disk). System prompt is supplied in-app so
 * AgentSession `_baseSystemPrompt` includes our designer-agentic text (survives
 * per-turn resets when customTools/extensions exist).
 */
import { type ResourceLoader, createExtensionRuntime } from './pi-sdk/index.ts';

export interface SandboxResourceLoaderOptions {
  /** Becomes Pi `ResourceLoader.getSystemPrompt()` — drives session base system prompt. */
  systemPrompt?: string;
}

export function createSandboxResourceLoader(
  options?: SandboxResourceLoaderOptions,
): ResourceLoader {
  const systemPrompt = options?.systemPrompt?.trim();
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
    getSystemPrompt: () => (systemPrompt && systemPrompt.length > 0 ? systemPrompt : undefined),
    getAppendSystemPrompt: () => [],
    extendResources() {},
  };
}
