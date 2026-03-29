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
    const requestBody = buildChatRequestFromMessages(model, messages, { stream: false });

    const data = await fetchChatCompletion(
      `${env.LMSTUDIO_URL}/v1/chat/completions`,
      requestBody,
      { 404: 'LM Studio not available. Make sure LM Studio is running and the server is enabled.' },
      'LM Studio',
    );
    return parseChatResponse(data, this.id);
  }

  isAvailable(): boolean {
    return true;
  }
}
