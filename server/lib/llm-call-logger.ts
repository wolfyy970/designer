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
import { beginLlmCall, failLlmCall, finalizeLlmCall } from '../log-store.ts';
import type { CompletionPurpose } from './completion-budget.ts';
import { callLLM } from '../services/compiler.ts';
import { providerLogFields } from './llm-log-metadata.ts';

export type LlmLogContext = Pick<LlmLogEntry, 'source' | 'phase' | 'correlationId'> & {
  signal?: AbortSignal;
};

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
  const sig = ctx.signal ?? options.signal;
  const logId = beginLlmCall({
    source: ctx.source,
    phase: ctx.phase,
    model,
    ...pv,
    systemPrompt,
    userPrompt,
    response: 'Waiting for provider…',
    ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
  });

  let settled = false;
  const onAbort = () => {
    if (settled) return;
    settled = true;
    failLlmCall(logId, 'Aborted', Math.round(performance.now() - t0));
  };

  if (sig?.aborted) {
    onAbort();
    throw new DOMException('Aborted', 'AbortError');
  }
  if (sig) sig.addEventListener('abort', onAbort);

  const mergedOptions: ProviderOptions = { ...options, signal: sig };

  try {
    const response = await provider.generateChat(messages, mergedOptions);
    if (sig) sig.removeEventListener('abort', onAbort);
    if (settled) throw new DOMException('Aborted', 'AbortError');
    settled = true;
    finalizeLlmCall(logId, {
      response: response.raw,
      durationMs: Math.round(performance.now() - t0),
      ...usageLogFields(response.metadata),
    });
    return response;
  } catch (err) {
    if (sig) sig.removeEventListener('abort', onAbort);
    if (!settled) {
      settled = true;
      failLlmCall(logId, String(err), Math.round(performance.now() - t0));
    }
    throw err;
  }
}

type CallLLMOptions = {
  temperature?: number;
  max_tokens?: number;
  images?: ReferenceImage[];
  signal?: AbortSignal;
  completionPurpose?: CompletionPurpose;
};

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
  const sig = options.signal ?? ctx.signal;

  const logId = beginLlmCall({
    source: ctx.source,
    phase: ctx.phase,
    model,
    ...pv,
    systemPrompt,
    userPrompt,
    response: 'Waiting for provider…',
    ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
  });

  let settled = false;
  const onAbort = () => {
    if (settled) return;
    settled = true;
    failLlmCall(logId, 'Aborted', Math.round(performance.now() - t0));
  };

  if (sig?.aborted) {
    onAbort();
    throw new DOMException('Aborted', 'AbortError');
  }
  if (sig) sig.addEventListener('abort', onAbort);

  try {
    const response = await callLLM(messages, model, providerId, {
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      images: options.images,
      signal: sig,
      completionPurpose: options.completionPurpose,
    });
    if (sig) sig.removeEventListener('abort', onAbort);
    if (settled) throw new DOMException('Aborted', 'AbortError');
    settled = true;
    finalizeLlmCall(logId, {
      response: response.raw,
      durationMs: Math.round(performance.now() - t0),
      ...usageLogFields(response.metadata),
    });
    return response.raw;
  } catch (err) {
    if (sig) sig.removeEventListener('abort', onAbort);
    if (!settled) {
      settled = true;
      failLlmCall(logId, String(err), Math.round(performance.now() - t0));
    }
    throw err;
  }
}
