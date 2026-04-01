/**
 * Central wrappers so every GenerationProvider.generateChat and callLLM usage
 * records one row in the dev LLM log (see /api/logs).
 */
import { performance } from 'node:perf_hooks';
import type {
  ChatMessage,
  ChatResponse,
  ChatResponseMetadata,
  GenerationProvider,
  ProviderOptions,
} from '../../src/types/provider.ts';
import type { ReferenceImage } from '../../src/types/spec.ts';
import type { LlmLogEntry } from '../log-store.ts';
import { logLlmCall } from '../log-store.ts';
import { callLLM } from '../services/compiler.ts';
import { providerLogFields } from './llm-log-metadata.ts';

export type LlmLogContext = Pick<LlmLogEntry, 'source' | 'phase'>;

function usageLogFields(meta?: ChatResponseMetadata): Partial<LlmLogEntry> {
  if (!meta) return {};
  const o: Partial<LlmLogEntry> = {};
  if (meta.promptTokens != null) o.promptTokens = meta.promptTokens;
  if (meta.completionTokens != null) o.completionTokens = meta.completionTokens;
  if (meta.totalTokens != null) o.totalTokens = meta.totalTokens;
  if (meta.reasoningTokens != null) o.reasoningTokens = meta.reasoningTokens;
  if (meta.cachedPromptTokens != null) o.cachedPromptTokens = meta.cachedPromptTokens;
  if (meta.costCredits != null) o.costCredits = meta.costCredits;
  if (meta.truncated) o.truncated = true;
  return o;
}

export function chatMessagesToLogFields(messages: ChatMessage[]): {
  systemPrompt: string;
  userPrompt: string;
} {
  const sys: string[] = [];
  const usr: string[] = [];
  for (const m of messages) {
    const text =
      typeof m.content === 'string'
        ? m.content
        : m.content.map((p) => (p.type === 'text' ? p.text : '[image]')).join('\n');
    if (m.role === 'system') sys.push(text);
    else if (m.role === 'user') usr.push(text);
    else if (m.role === 'assistant') usr.push(`[assistant]\n${text}`);
  }
  return {
    systemPrompt: sys.join('\n\n') || '(no system message)',
    userPrompt: usr.join('\n\n') || '(no user message)',
  };
}

export async function loggedGenerateChat(
  provider: GenerationProvider,
  providerId: string,
  messages: ChatMessage[],
  options: ProviderOptions,
  ctx: LlmLogContext,
): Promise<ChatResponse> {
  const model = options.model ?? '';
  const { systemPrompt, userPrompt } = chatMessagesToLogFields(messages);
  const t0 = performance.now();
  const pv = providerLogFields(providerId);
  try {
    const response = await provider.generateChat(messages, options);
    logLlmCall({
      source: ctx.source,
      phase: ctx.phase,
      model,
      ...pv,
      systemPrompt,
      userPrompt,
      response: response.raw,
      durationMs: Math.round(performance.now() - t0),
      ...usageLogFields(response.metadata),
    });
    return response;
  } catch (err) {
    logLlmCall({
      source: ctx.source,
      phase: ctx.phase,
      model,
      ...pv,
      systemPrompt,
      userPrompt,
      response: '',
      durationMs: Math.round(performance.now() - t0),
      error: String(err),
    });
    throw err;
  }
}

type CallLLMOptions = { temperature?: number; max_tokens?: number; images?: ReferenceImage[] };

/** Same as callLLM with automatic logLlmCall (success or transport error). */
export async function loggedCallLLM(
  messages: ChatMessage[],
  model: string,
  providerId: string,
  options: CallLLMOptions,
  ctx: LlmLogContext,
): Promise<string> {
  const { systemPrompt, userPrompt } = chatMessagesToLogFields(messages);
  const t0 = performance.now();
  const pv = providerLogFields(providerId);
  try {
    const response = await callLLM(messages, model, providerId, options);
    logLlmCall({
      source: ctx.source,
      phase: ctx.phase,
      model,
      ...pv,
      systemPrompt,
      userPrompt,
      response: response.raw,
      durationMs: Math.round(performance.now() - t0),
      ...usageLogFields(response.metadata),
    });
    return response.raw;
  } catch (err) {
    logLlmCall({
      source: ctx.source,
      phase: ctx.phase,
      model,
      ...pv,
      systemPrompt,
      userPrompt,
      response: '',
      durationMs: Math.round(performance.now() - t0),
      error: String(err),
    });
    throw err;
  }
}
