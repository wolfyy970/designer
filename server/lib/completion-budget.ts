/**
 * Prompt-aware completion budgets: `context_window − prompt − margin`, capped by product limits.
 *
 * **Prompt size** here mostly comes from `estimateChatMessagesTokens` (heuristic). OpenRouter
 * reports exact `usage.prompt_tokens` only **after** `chat/completions` returns; there is no
 * documented universal “preflight count” for all routed models. To tighten budgets in the future,
 * thread the last response’s `metadata.promptTokens` into this layer (or max with the heuristic)
 * for sequential calls where the prompt grows monotonically (typical agent loops).
 */
import type { Context } from '@mariozechner/pi-ai';
import { env } from '../env.ts';
import {
  estimateChatMessagesTokens,
  estimateTextTokens,
} from '../../src/lib/token-estimate.ts';
import type { ChatMessage } from '../../src/types/provider.ts';
import { getProviderModelContextWindow } from './provider-model-context.ts';

export type CompletionPurpose = 'compile' | 'compaction' | 'agent_turn' | 'default';

const MIN_COMPLETION = 256;
const ABSOLUTE_CEILING = 2_097_152;

/** Reserved tokens: formatting, tool defs growth, reasoning, safety. */
const MARGIN: Record<CompletionPurpose, number> = {
  /** Single structured JSON; smaller reserve. */
  compile: 1_536,
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

function estimateUserMessageContent(
  content: string | Array<{ type: string; text?: string; thinking?: string; data?: string }>,
): number {
  if (typeof content === 'string') return estimateTextTokens(content);
  let n = 0;
  for (const p of content) {
    if (p.type === 'text' && typeof p.text === 'string') n += estimateTextTokens(p.text);
    else if (p.type === 'thinking' && typeof p.thinking === 'string') {
      n += estimateTextTokens(p.thinking);
    } else if (p.type === 'image' && typeof p.data === 'string') n += 2_500;
  }
  return Math.max(n, 6);
}

/** Pi `Context` token estimate for one streaming turn. */
export function estimatePiContextTokens(context: Context): number {
  let n = estimateTextTokens(context.systemPrompt ?? '');
  for (const m of context.messages) {
    if (m.role === 'user' || m.role === 'toolResult') {
      n += estimateUserMessageContent(m.content as Parameters<typeof estimateUserMessageContent>[0]);
    } else if (m.role === 'assistant') {
      for (const c of m.content) {
        if (c.type === 'text') n += estimateTextTokens(c.text);
        else if (c.type === 'thinking') n += estimateTextTokens(c.thinking);
        else if (c.type === 'toolCall') {
          n += estimateTextTokens(JSON.stringify(c.arguments ?? {}));
          n += estimateTextTokens(c.name);
        }
      }
    }
  }
  if (context.tools?.length) {
    for (const t of context.tools) {
      n += estimateTextTokens(`${t.name}\n${t.description}\n${JSON.stringify(t.parameters ?? {})}`);
    }
  }
  return Math.ceil(n * 1.04);
}

/**
 * Per-turn Pi stream budget: shrinks as the agent context grows.
 * Respects `model.maxTokens` session ceiling and optional `MAX_OUTPUT_TOKENS`.
 */
export function piStreamCompletionMaxTokens(
  model: { contextWindow: number; maxTokens: number },
  context: Context,
  explicitFromOptions?: number,
): number {
  if (explicitFromOptions != null) return explicitFromOptions;
  const est = estimatePiContextTokens(context);
  const product = env.MAX_OUTPUT_TOKENS;
  const dynamic = completionBudgetFromPromptTokens(
    model.contextWindow,
    est,
    'agent_turn',
    product ?? undefined,
  );
  const ceil = Math.min(model.maxTokens, product ?? model.maxTokens);
  if (dynamic == null) return ceil;
  return Math.min(dynamic, ceil);
}
