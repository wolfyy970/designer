/**
 * Fresh agentic system prompt + sandbox AGENTS.md seed from Langfuse
 * (`genSystemHtmlAgentic` + `sandboxAgentsContext`).
 * Call once per PI session boundary so Prompt Studio edits apply to the next build or revision.
 */
import type { PromptKey } from './prompts/defaults.ts';

export async function buildAgenticSystemContext(input: {
  getPromptBody: (key: PromptKey) => Promise<string>;
}): Promise<{
  systemPrompt: string;
  sandboxSeedFiles: Record<string, string>;
}> {
  const baseAgenticPrompt = await input.getPromptBody('genSystemHtmlAgentic');
  const systemPrompt = baseAgenticPrompt;
  const agentsContext = (await input.getPromptBody('sandboxAgentsContext')).trim();
  const sandboxSeedFiles: Record<string, string> = {};
  if (agentsContext.length > 0) {
    sandboxSeedFiles['AGENTS.md'] = agentsContext;
  }
  return { systemPrompt, sandboxSeedFiles };
}
