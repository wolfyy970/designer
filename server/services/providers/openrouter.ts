import type {
  GenerationProvider,
  ProviderModel,
  ProviderOptions,
  ChatResponse,
  ChatMessage,
} from '../../../src/types/provider.ts';
import { env } from '../../env.ts';
import { buildChatRequestFromMessages, fetchChatCompletion, fetchModelList, parseChatResponse } from '../../lib/provider-helpers.ts';
import { supportsReasoningModel } from '../../../src/lib/model-capabilities.ts';

function authHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
  };
}

export class OpenRouterGenerationProvider implements GenerationProvider {
  id = 'openrouter';
  name = 'OpenRouter';
  description = 'Generates HTML code via OpenRouter (Claude, GPT-4o, Gemini, etc.)';
  supportsImages = false;
  supportsParallel = true;

  async listModels(): Promise<ProviderModel[]> {
    return fetchModelList(
      `${env.OPENROUTER_BASE_URL}/api/v1/models`,
      (models) =>
        models.map((m) => ({
          id: m.id as string,
          name: (m.name as string) ?? (m.id as string),
          contextLength: m.context_length as number | undefined,
          supportsVision: typeof m.modality === 'string' && (m.modality as string).includes('image'),
          supportsReasoning: supportsReasoningModel(m.id as string),
        })),
      authHeaders(),
    );
  }

  async generateChat(
    messages: ChatMessage[],
    options: ProviderOptions
  ): Promise<ChatResponse> {
    const model = options.model || 'anthropic/claude-sonnet-4.5';
    const requestBody = buildChatRequestFromMessages(model, messages);

    const data = await fetchChatCompletion(
      `${env.OPENROUTER_BASE_URL}/api/v1/chat/completions`,
      requestBody,
      {
        401: 'Invalid OpenRouter API key.',
        429: 'Rate limit exceeded. Wait a moment and try again.',
      },
      'OpenRouter',
      authHeaders(),
    );
    return parseChatResponse(data);
  }

  isAvailable(): boolean {
    return !!env.OPENROUTER_API_KEY;
  }
}
