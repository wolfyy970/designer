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
import {
  appendLlmCallResponse,
  beginLlmCall,
  failLlmCall,
  finalizeLlmCall,
  setLlmCallResponseBody,
  setLlmCallWaitingStatus,
} from '../log-store.ts';
import type { CompletionPurpose } from './completion-budget.ts';
import { callLLM } from '../services/compiler.ts';
import { providerLogFields } from './llm-log-metadata.ts';
import { runWithOptionalLlmGeneration } from './langfuse-llm-generation.ts';

const LLM_WAIT_PULSE_MS = 6000;

/** Updates in-progress log row with elapsed seconds until cancelled (blocking + pre-first-token stream). */
function runWaitingPulse(logId: string, t0: number): () => void {
  const tick = () => {
    const sec = Math.round((performance.now() - t0) / 1000);
    setLlmCallWaitingStatus(logId, `Waiting for provider… (${sec}s)`);
  };
  const handle = setInterval(tick, LLM_WAIT_PULSE_MS);
  tick();
  return () => clearInterval(handle);
}

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

function usageDetailsForLangfuse(meta?: ChatResponseMetadata): Record<string, number> | undefined {
  if (!meta) return undefined;
  const o: Record<string, number> = {};
  if (meta.promptTokens != null) o.prompt_tokens = meta.promptTokens;
  if (meta.completionTokens != null) o.completion_tokens = meta.completionTokens;
  if (meta.totalTokens != null) o.total_tokens = meta.totalTokens;
  if (meta.reasoningTokens != null) o.reasoning_tokens = meta.reasoningTokens;
  return Object.keys(o).length ? o : undefined;
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

  return runWithOptionalLlmGeneration(
    `llm:${ctx.source}:${ctx.phase}`,
    ctx.correlationId,
    async (upd) => {
      upd({
        model,
        input: { systemPrompt, userPrompt },
        metadata: { ...pv, providerId, source: ctx.source, phase: ctx.phase },
      });

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
      const stopPulse = runWaitingPulse(logId, t0);

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
        upd({
          output: response.raw,
          usageDetails: usageDetailsForLangfuse(response.metadata),
        });
        return response;
      } catch (err) {
        if (sig) sig.removeEventListener('abort', onAbort);
        if (!settled) {
          settled = true;
          failLlmCall(logId, String(err), Math.round(performance.now() - t0));
        }
        upd({ level: 'ERROR', statusMessage: String(err) });
        throw err;
      } finally {
        stopPulse();
      }
    },
  );
}

/**
 * Like {@link loggedGenerateChat}, but uses {@link GenerationProvider.generateChatStream} when present
 * so the UI can show tokens as they arrive; falls back to {@link loggedGenerateChat} otherwise.
 */
export async function loggedGenerateChatStream(
  provider: GenerationProvider,
  providerId: string,
  messages: ChatMessage[],
  options: ProviderOptions,
  ctx: LlmLogContext,
  onDelta: (accumulatedRaw: string) => void | Promise<void>,
): Promise<ChatResponse> {
  const model = options.model ?? '';
  const { systemPrompt, userPrompt } = chatMessagesToLogFields(messages);
  const t0 = performance.now();
  const pv = providerLogFields(providerId);
  const sig = ctx.signal ?? options.signal;

  return runWithOptionalLlmGeneration(
    `llm:${ctx.source}:${ctx.phase}`,
    ctx.correlationId,
    async (upd) => {
      upd({
        model,
        input: { systemPrompt, userPrompt },
        metadata: { ...pv, providerId, source: ctx.source, phase: ctx.phase },
      });

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
      let stopPulse = runWaitingPulse(logId, t0);
      let accSeenLen = 0;
      let streamBodyStarted = false;

      const onDeltaForLog = async (accumulated: string) => {
        const incremental = accumulated.slice(accSeenLen);
        accSeenLen = accumulated.length;
        if (incremental) {
          if (!streamBodyStarted) {
            streamBodyStarted = true;
            stopPulse();
            stopPulse = () => {};
            setLlmCallResponseBody(logId, incremental);
          } else {
            appendLlmCallResponse(logId, incremental);
          }
        }
        await onDelta(accumulated);
      };

      try {
        const streamFn = provider.generateChatStream;
        const response = streamFn
          ? await streamFn.call(provider, messages, mergedOptions, onDeltaForLog)
          : await (async () => {
              const r = await provider.generateChat(messages, mergedOptions);
              await onDeltaForLog(r.raw);
              return r;
            })();
        if (sig) sig.removeEventListener('abort', onAbort);
        if (settled) throw new DOMException('Aborted', 'AbortError');
        settled = true;
        finalizeLlmCall(logId, {
          response: response.raw,
          durationMs: Math.round(performance.now() - t0),
          ...usageLogFields(response.metadata),
        });
        upd({
          output: response.raw,
          usageDetails: usageDetailsForLangfuse(response.metadata),
        });
        return response;
      } catch (err) {
        if (sig) sig.removeEventListener('abort', onAbort);
        if (!settled) {
          settled = true;
          failLlmCall(logId, String(err), Math.round(performance.now() - t0));
        }
        upd({ level: 'ERROR', statusMessage: String(err) });
        throw err;
      } finally {
        stopPulse();
      }
    },
  );
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

  return runWithOptionalLlmGeneration(
    `llm:${ctx.source}:${ctx.phase}`,
    ctx.correlationId,
    async (upd) => {
      upd({
        model,
        input: { systemPrompt, userPrompt },
        metadata: { ...pv, providerId, source: ctx.source, phase: ctx.phase },
      });

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

      const stopPulse = runWaitingPulse(logId, t0);
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
        upd({
          output: response.raw,
          usageDetails: usageDetailsForLangfuse(response.metadata),
        });
        return response.raw;
      } catch (err) {
        if (sig) sig.removeEventListener('abort', onAbort);
        if (!settled) {
          settled = true;
          failLlmCall(logId, String(err), Math.round(performance.now() - t0));
        }
        upd({ level: 'ERROR', statusMessage: String(err) });
        throw err;
      } finally {
        stopPulse();
      }
    },
  );
}
