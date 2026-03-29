/**
 * PI agent context compaction — model construction + LLM/fallback summarization.
 */
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { Model } from '@mariozechner/pi-ai';
import { env } from '../env.ts';
import { getProvider } from './providers/registry.ts';
import type { TodoItem } from '../../src/types/provider.ts';

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high';

const ZEROED_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * Construct a PI Model object for the given provider/model pair.
 * Uses manual construction (NOT getModel() from PI's curated registry)
 * so any OpenRouter or LM Studio model ID works without PI needing to know it.
 */
export function buildModel(
  providerId: string,
  modelId: string,
  thinkingLevel?: ThinkingLevel,
): Model<'openai-completions'> {
  // `reasoning: true` tells PI to include `reasoning_effort` in the API request.
  // Only set when the user has explicitly opted into a thinking level.
  // Models that don't support extended reasoning will either ignore the parameter
  // or return a clear API error — not a silent no-op.
  const reasoning = !!thinkingLevel && thinkingLevel !== 'off';

  if (providerId === 'lmstudio') {
    return {
      id: modelId,
      name: modelId,
      api: 'openai-completions',
      provider: 'lmstudio',
      baseUrl: `${env.LMSTUDIO_URL}/v1`,
      reasoning,
      input: ['text'],
      cost: ZEROED_COST,
      contextWindow: 131072,
      maxTokens: 16384,
    };
  }

  // Default: OpenRouter.
  // PI recognizes provider='openrouter' and resolves OPENROUTER_API_KEY from env automatically,
  // so no explicit Authorization header is needed here.
  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: 'openrouter',
    baseUrl: `${env.OPENROUTER_BASE_URL}/api/v1`,
    reasoning,
    input: ['text'],
    cost: ZEROED_COST,
    contextWindow: 131072,
    maxTokens: 16384,
  };
}

/**
 * Fallback summary used when LLM compaction is unavailable or fails.
 */
export function buildFallbackSummary(droppedCount: number, filesWritten: string[], todos?: TodoItem[]): string {
  const base =
    `[Context compacted: ${droppedCount} earlier messages summarized.]\n` +
    `Files written: ${filesWritten.length > 0 ? filesWritten.join(', ') : 'none yet'}.\n` +
    `Continue the design work from your current state.`;

  if (!todos || todos.length === 0) return base;

  const todoAppendix =
    '\n\n[Current todo list at time of compaction]\n' +
    todos
      .map((t) => {
        const icon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '●' : '○';
        return `${icon} [${t.status}] ${t.task}`;
      })
      .join('\n');

  return base + todoAppendix;
}

/**
 * Calls the provider to produce a structured LLM summary of dropped messages.
 * Falls back to buildFallbackSummary if the provider is unavailable or throws.
 */
export async function compactWithLLM(
  messages: AgentMessage[],
  filesWritten: string[],
  providerId: string,
  modelId: string,
  extraContext?: string,
): Promise<string> {
  const provider = getProvider(providerId);
  if (!provider) return buildFallbackSummary(messages.length, filesWritten);

  // Convert messages to a readable transcript, capped per-message to control prompt size.
  const MAX_MSG_CHARS = 1500;
  const transcript = messages
    .map((m) => {
      const role = String(m.role).toUpperCase();
      const raw = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      const text = raw.length > MAX_MSG_CHARS ? raw.slice(0, MAX_MSG_CHARS) + '…' : raw;
      return `[${role}]\n${text}`;
    })
    .join('\n\n');

  try {
    const response = await provider.generateChat(
      [
        {
          role: 'system',
          content:
            'You are summarizing a design agent session for context window management. ' +
            'Produce a structured checkpoint covering: ' +
            '(1) the design hypothesis being implemented, ' +
            '(2) key decisions made — palette, typography, layout, architecture, ' +
            '(3) each file written and its current purpose/state, ' +
            '(4) what was revised and why, ' +
            '(5) current state and what remains to be done. ' +
            'Be specific. Another AI will use this summary to continue the work seamlessly.',
        },
        {
          role: 'user',
          content:
            `Summarize this design session:\n\n${transcript}` +
            (extraContext ? `\n\n${extraContext}` : ''),
        },
      ],
      { model: modelId },
    );
    return response.raw;
  } catch {
    return buildFallbackSummary(messages.length, filesWritten);
  }
}
