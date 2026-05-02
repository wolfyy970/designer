/**
 * Pi resource loader for embedded agent sessions: does not read the host repo
 * (e.g. root AGENTS.md for developers vs the virtual AGENTS.md inside Pi). The
 * system prompt is supplied in-app so AgentSession `_baseSystemPrompt` includes
 * our designer-agentic text (survives per-turn resets when customTools exist).
 *
 * Compaction uses Pi's built-in defaults — no custom extension factory, no
 * custom prompt body. Pi triggers compaction when tokens exceed the model's
 * context window minus its reserveTokens default; the resulting summary keeps
 * the last `keepRecentTokens` of conversation intact and rolls the rest into a
 * compaction entry.
 *
 * Call `reload()` before `createAgentSession` — the SDK skips `reload` when a
 * loader is injected.
 */
import { SANDBOX_PROJECT_ROOT } from './virtual-workspace.ts';
import { DefaultResourceLoader, type ResourceLoader } from './pi-sdk/types.ts';

export interface SandboxResourceLoaderOptions {
  /** Becomes Pi `ResourceLoader.getSystemPrompt()` — drives session base system prompt. */
  systemPrompt?: string;
}

export interface SandboxResourceLoaderBundle {
  resourceLoader: ResourceLoader;
}

export async function createSandboxResourceLoader(
  options: SandboxResourceLoaderOptions,
): Promise<SandboxResourceLoaderBundle> {
  const systemPrompt = options.systemPrompt?.trim();

  const loader = new DefaultResourceLoader({
    cwd: SANDBOX_PROJECT_ROOT,
    /** Required since Pi 0.72 even when every loader (extensions/skills/prompts/themes) is disabled. */
    agentDir: SANDBOX_PROJECT_ROOT,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    systemPrompt: systemPrompt && systemPrompt.length > 0 ? systemPrompt : undefined,
  });

  await loader.reload();

  return { resourceLoader: loader };
}
