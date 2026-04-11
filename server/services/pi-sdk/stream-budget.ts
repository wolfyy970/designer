/**
 * Pi `Context` token heuristics for `streamFn` max_tokens (agent turns only).
 */
import type { Context } from './types.ts';
import { completionBudgetFromPromptTokens } from '../../lib/completion-budget.ts';
import { env } from '../../env.ts';
import { estimateTextTokens } from '../../../src/lib/token-estimate.ts';

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
function estimatePiContextTokens(context: Context): number {
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
