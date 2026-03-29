export {
  fetchChatCompletion,
  extractMessageText,
  fetchModelList,
  parseChatResponse,
} from '../../src/lib/provider-fetch.ts';

import { env } from '../env.ts';
import { buildChatRequestFromMessages as _build } from '../../src/lib/provider-helpers.ts';
import type { ChatMessage } from '../../src/types/provider.ts';

export function buildChatRequestFromMessages(
  model: string,
  messages: ChatMessage[],
  extraFields?: Record<string, unknown>,
): Record<string, unknown> {
  return _build(model, messages, extraFields, env.MAX_OUTPUT_TOKENS);
}
