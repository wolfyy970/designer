import type { ChatMessage } from '../types/provider';

/** Vite injects `env`; Node project refs (e.g. tsconfig.server) don't ship `ImportMeta.env` typings. */
function viteMaxOutputTokensFromEnv(): string | undefined {
  return (import.meta as { env?: { VITE_MAX_OUTPUT_TOKENS?: string } }).env?.VITE_MAX_OUTPUT_TOKENS;
}

export {
  extractMessageText,
  fetchChatCompletion,
  fetchModelList,
  parseChatResponse,
} from './provider-fetch';

/** Build OpenAI-compatible chat request body from an array of messages */
export function buildChatRequestFromMessages(
  model: string,
  messages: ChatMessage[],
  extraFields?: Record<string, unknown>,
  maxTokens?: number,
): Record<string, unknown> {
  const envMax = viteMaxOutputTokensFromEnv();
  const resolved = maxTokens ?? (envMax ? parseInt(envMax, 10) : undefined);

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.7,
    ...extraFields,
  };

  if (resolved) {
    body.max_tokens = resolved;
  }

  return body;
}
