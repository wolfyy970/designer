import type {
  GenerationProvider,
  ProviderModel,
  ProviderOptions,
  ChatResponse,
  ChatMessage,
} from '../../../src/types/provider.ts';
import { env } from '../../env.ts';
import { completionMaxTokensForChat } from '../../lib/completion-budget.ts';
import {
  buildChatRequestFromMessages,
  fetchChatCompletion,
  fetchModelList,
  parseChatResponse,
} from '../../lib/provider-helpers.ts';
import { streamOpenAICompatibleChat } from '../../lib/openai-chat-stream.ts';
import { supportsReasoningModel } from '../../../src/lib/model-capabilities.ts';
import { lmStudioThinkingFields } from '../../../src/lib/provider-thinking-params.ts';

const DEFAULT_MODEL = 'qwen/qwen3-coder-next';

export class LMStudioProvider implements GenerationProvider {
  id = 'lmstudio';
  name = 'LM Studio (Local)';
  description = 'Local inference via LM Studio API';
  supportsImages = false;
  supportsParallel = false;

  async listModels(): Promise<ProviderModel[]> {
    return fetchModelList(`${env.LMSTUDIO_URL}/v1/models`, (models) =>
      models.map((m) => {
        const id = m.id as string;
        return { id, name: id, supportsReasoning: supportsReasoningModel(id) };
      }),
    );
  }

  async generateChat(
    messages: ChatMessage[],
    options: ProviderOptions
  ): Promise<ChatResponse> {
    const model = options.model || DEFAULT_MODEL;
    const purpose = options.completionPurpose ?? 'default';
    const maxTok = await completionMaxTokensForChat('lmstudio', model, messages, purpose);
    const thinkingExtras = lmStudioThinkingFields(options.thinking);
    const requestBody = buildChatRequestFromMessages(
      model,
      messages,
      { stream: false, ...thinkingExtras },
      maxTok,
    );

    const data = await fetchChatCompletion(
      `${env.LMSTUDIO_URL}/v1/chat/completions`,
      requestBody,
      { 404: 'LM Studio not available. Make sure LM Studio is running and the server is enabled.' },
      'LM Studio',
      undefined,
      options.signal,
    );
    return parseChatResponse(data);
  }

  async generateChatStream(
    messages: ChatMessage[],
    options: ProviderOptions,
    onDelta: (accumulatedRaw: string) => void | Promise<void>,
  ): Promise<ChatResponse> {
    const model = options.model || DEFAULT_MODEL;
    const purpose = options.completionPurpose ?? 'default';
    const maxTok = await completionMaxTokensForChat('lmstudio', model, messages, purpose);
    const thinkingExtras = lmStudioThinkingFields(options.thinking);
    const requestBody = buildChatRequestFromMessages(
      model,
      messages,
      { stream: true, ...thinkingExtras },
      maxTok,
    );
    return streamOpenAICompatibleChat(
      `${env.LMSTUDIO_URL}/v1/chat/completions`,
      requestBody,
      {
        signal: options.signal,
        errorMap: {
          404: 'LM Studio not available. Make sure LM Studio is running and the server is enabled.',
        },
        providerLabel: 'LM Studio',
      },
      onDelta,
    );
  }

  isAvailable(): boolean {
    return true;
  }
}
