export {
  fetchChatCompletion,
  extractMessageText,
  fetchModelList,
  parseChatResponse,
} from '../../src/lib/provider-fetch.ts';

import { buildChatRequestFromMessages as _build } from '../../src/lib/provider-helpers.ts';
import type { ChatMessage } from '../../src/types/provider.ts';

export function buildChatRequestFromMessages(
  model: string,
  messages: ChatMessage[],
  extraFields?: Record<string, unknown>,
  maxTokens?: number,
): Record<string, unknown> {
  return _build(model, messages, extraFields, maxTokens);
}
