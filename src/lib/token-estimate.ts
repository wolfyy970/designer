/**
 * Lightweight **preflight** token estimates for chat payloads (no tokenizer dependency).
 *
 * ### How production systems usually count tokens
 * - **After the request:** OpenAI-compatible APIs (including [OpenRouter](https://openrouter.ai/docs/api-reference/overview))
 *   return `usage.prompt_tokens` / `completion_tokens` from the **model’s native tokenizer**
 *   (see `ResponseUsage` in their docs). That is the ground truth, but it is only available
 *   **once a completion has run** (or in the final SSE chunk when streaming).
 * - **Before the request:** Common approaches are (1) **official / vendor tokenizers** (e.g. OpenAI’s
 *   tiktoken, Anthropic’s tokenizer for Claude, etc.) keyed to **one** model family; (2) **vendor
 *   “count input” APIs** where offered (e.g. some providers expose dedicated counting for their
 *   own schema); (3) **char or byte heuristics** as a cheap fallback when routing many models.
 *   Heuristics systematically drift on code, multibyte text, images, and tool schemas.
 *
 * ### OpenRouter specifically
 * Public docs describe **no general “count this body without inferencing” endpoint** for arbitrary
 * routed models. Budgeting `max_tokens` **before** the first byte must therefore use heuristics
 * or per-model tokenizer libraries—not a single OpenRouter GET.
 *
 * This module is intentionally that cheap fallback so we can size `max_tokens` without N tokenizer
 * packages or an extra network round-trip. Prefer `usage` from the last response when you need
 * exact numbers (e.g. tightening budgets on the **next** turn in a long agent session).
 */
import type { ChatMessage, ContentPart } from '../types/provider';

const CHARS_PER_TOKEN = 3.6;
/** Per-message role/format overhead in estimated tokens. */
const MESSAGE_OVERHEAD = 6;

export function estimateTextTokens(text: string): number {
  if (!text) return MESSAGE_OVERHEAD;
  return Math.ceil(text.length / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD;
}

function estimatePartsTokens(parts: ContentPart[]): number {
  let n = MESSAGE_OVERHEAD;
  for (const p of parts) {
    if (p.type === 'text') n += Math.ceil(p.text.length / CHARS_PER_TOKEN);
    else if (p.type === 'image_url') n += 2_500; // vision: rough tile cost
  }
  return n;
}

function estimateMessageContentTokens(content: string | ContentPart[]): number {
  if (typeof content === 'string') return estimateTextTokens(content);
  return estimatePartsTokens(content);
}

/** Sum all chat messages (system/user/assistant) as sent to the provider. */
export function estimateChatMessagesTokens(messages: ChatMessage[]): number {
  let sum = 0;
  for (const m of messages) {
    sum += estimateMessageContentTokens(m.content);
  }
  return Math.ceil(sum * 1.04);
}
