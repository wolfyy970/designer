/**
 * Prompt-aware completion budgets: `context_window − prompt − margin`, capped by product limits.
 *
 * **Prompt size** here mostly comes from `estimateChatMessagesTokens` (heuristic). OpenRouter
 * reports exact `usage.prompt_tokens` only **after** `chat/completions` returns; there is no
 * documented universal “preflight count” for all routed models. To tighten budgets in the future,
 * thread the last response’s `metadata.promptTokens` into this layer (or max with the heuristic)
 * for sequential calls where the prompt grows monotonically (typical agent loops).
 *
 * Pi agent per-turn streaming uses `server/services/pi-sdk/stream-budget.ts` (imports this module).
 */
import { env } from '../env.ts';
import {
  estimateChatMessagesTokens,
} from '../../src/lib/token-estimate.ts';
import type { ChatMessage } from '../../src/types/provider.ts';
import { getProviderModelContextWindow } from './provider-model-context.ts';

export type CompletionPurpose = 'incubate' | 'compaction' | 'agent_turn' | 'default';

const MIN_COMPLETION = 256;
const ABSOLUTE_CEILING = 2_097_152;

/** Reserved tokens: formatting, tool defs growth, reasoning, safety. */
const MARGIN: Record<CompletionPurpose, number> = {
  /** Single structured JSON; smaller reserve. */
  incubate: 1_536,
  /** Summaries; moderate user blob. */
  compaction: 2_048,
  /** Long transcript + tools in context. */
  agent_turn: 6_144,
  /** Generic chat completion. */
  default: 4_096,
};

function contextFallback(providerId: string): number {
  return providerId === 'lmstudio' ? env.LM_STUDIO_CONTEXT_WINDOW : 131_072;
}

/**
 * Pure: completion tokens that fit after prompt + margin, optional product cap.
 * Returns `undefined` if the window appears already exhausted (caller may omit max_tokens).
 */
export function completionBudgetFromPromptTokens(
  contextWindow: number,
  estimatedPromptTokens: number,
  purpose: CompletionPurpose,
  productCap?: number,
): number | undefined {
  const cw = Math.max(4096, contextWindow);
  const margin = MARGIN[purpose];
  const prompt = Math.max(0, estimatedPromptTokens);
  const raw = cw - prompt - margin;
  if (raw < MIN_COMPLETION) return undefined;
  let b = Math.min(raw, ABSOLUTE_CEILING);
  if (productCap != null) b = Math.min(b, productCap);
  return Math.max(MIN_COMPLETION, b);
}

export async function completionMaxTokensForChat(
  providerId: string,
  modelId: string,
  messages: ChatMessage[],
  purpose: CompletionPurpose,
): Promise<number | undefined> {
  const registry =
    (await getProviderModelContextWindow(providerId, modelId)) ?? contextFallback(providerId);
  const est = estimateChatMessagesTokens(messages);
  return completionBudgetFromPromptTokens(
    registry,
    est,
    purpose,
    env.MAX_OUTPUT_TOKENS,
  );
}
