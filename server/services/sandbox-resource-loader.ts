/**
 * Pi resource loader for embedded agent sessions: does not read the host repo
 * (e.g. root AGENTS.md for developers vs the virtual AGENTS.md inside Pi). System prompt is supplied in-app so
 * AgentSession `_baseSystemPrompt` includes our designer-agentic text (survives
 * per-turn resets when customTools/extensions exist).
 *
 * Uses Pi `DefaultResourceLoader` so inline `extensionFactories` run (designer compaction hook).
 * Call `reload()` before `createAgentSession` — the SDK skips `reload` when a loader is injected.
 */
import { SANDBOX_PROJECT_ROOT } from './agent-bash-sandbox.ts';
import {
  DefaultResourceLoader,
  SettingsManager,
  type ResourceLoader,
  type ExtensionFactory,
} from './pi-sdk/types.ts';
import { createDesignerCompactionExtensionFactory } from './designer-compaction-extension.ts';

export interface SandboxResourceLoaderOptions {
  /** Becomes Pi `ResourceLoader.getSystemPrompt()` — drives session base system prompt. */
  systemPrompt?: string;
  /** Model context window for this session — drives conservative auto-compaction threshold. */
  contextWindow: number;
  /** When set, Pi `compact()` receives this text as custom "Additional focus" (e.g. `agent-context-compaction` prompt). */
  getCompactionPromptBody?: () => Promise<string>;
}

export interface SandboxResourceLoaderBundle {
  resourceLoader: ResourceLoader;
  /** Must be the same instance passed to `createAgentSession({ settingsManager })` so compaction thresholds apply. */
  settingsManager: SettingsManager;
}

/** ~72% of context usage before auto-compaction (Pi triggers when tokens > contextWindow − reserveTokens). */
export function compactionReserveTokensForContextWindow(contextWindow: number): number {
  return Math.max(24_000, Math.floor(contextWindow * 0.28));
}

export async function createSandboxResourceLoader(
  options: SandboxResourceLoaderOptions,
): Promise<SandboxResourceLoaderBundle> {
  const systemPrompt = options.systemPrompt?.trim();
  const reserveTokens = compactionReserveTokensForContextWindow(options.contextWindow);
  const settingsManager = SettingsManager.inMemory({
    compaction: {
      enabled: true,
      reserveTokens,
      keepRecentTokens: 20_000,
    },
  });

  const extensionFactories: ExtensionFactory[] = [];
  if (options.getCompactionPromptBody) {
    extensionFactories.push(
      createDesignerCompactionExtensionFactory(options.getCompactionPromptBody),
    );
  }

  const loader = new DefaultResourceLoader({
    cwd: SANDBOX_PROJECT_ROOT,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    extensionFactories,
    systemPrompt: systemPrompt && systemPrompt.length > 0 ? systemPrompt : undefined,
  });

  await loader.reload();

  return { resourceLoader: loader, settingsManager };
}
