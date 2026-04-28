/**
 * Central wrapper so every GenerationProvider.generateChat usage records one row in the dev LLM log.
 */
import { performance } from 'node:perf_hooks';
import type {
  ChatMessage,
  ChatResponse,
  ChatResponseMetadata,
  GenerationProvider,
  ProviderOptions,
} from '../../src/types/provider.ts';
import type { LlmLogEntry } from '../log-store.ts';
import {
  beginLlmCall,
  failLlmCall,
  finalizeLlmCall,
  setLlmCallWaitingStatus,
} from '../log-store.ts';
import { providerLogFields } from './llm-log-metadata.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';

const LLM_WAIT_PULSE_MS = 6000;

type GenerationUpdater = (attrs: Record<string, unknown>) => void;
const noopUpdater: GenerationUpdater = () => {};

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

type LlmCallLifecycleHandles = {
  logId: string;
  t0: number;
  sig: AbortSignal | undefined;
  /** Call when the first streamed response body chunk is written to the log (stops waiting pulse). */
  onFirstStreamBody: () => void;
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


/**
 * Shared lifecycle: input metadata, dev log row, abort wiring, waiting pulse,
 * finalize/fail + output on success/error.
 */
export async function withLlmCallLifecycle(
  ctx: LlmLogContext,
  model: string,
  providerId: string,
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal | undefined,
  upd: GenerationUpdater,
  run: (handles: LlmCallLifecycleHandles) => Promise<ChatResponse>,
): Promise<ChatResponse> {
  const t0 = performance.now();
  const pv = providerLogFields(providerId);

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

  if (signal?.aborted) {
    onAbort();
    throw new DOMException('Aborted', 'AbortError');
  }
  if (signal) signal.addEventListener('abort', onAbort);

  let stopPulse = runWaitingPulse(logId, t0);
  const onFirstStreamBody = () => {
    stopPulse();
    stopPulse = () => {};
  };

  try {
    const response = await run({
      logId,
      t0,
      sig: signal,
      onFirstStreamBody,
    });
    if (signal) signal.removeEventListener('abort', onAbort);
    if (settled) throw new DOMException('Aborted', 'AbortError');
    settled = true;
    finalizeLlmCall(logId, {
      response: response.raw,
      durationMs: Math.round(performance.now() - t0),
      ...usageLogFields(response.metadata),
    });
    return response;
  } catch (err) {
    if (signal) signal.removeEventListener('abort', onAbort);
    if (!settled) {
      settled = true;
      failLlmCall(logId, normalizeError(err), Math.round(performance.now() - t0));
    }
    throw err;
  } finally {
    stopPulse();
  }
}

function chatMessagesToLogFields(messages: ChatMessage[]): {
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
  const sig = ctx.signal ?? options.signal;
  const mergedOptions: ProviderOptions = { ...options, signal: sig };

  return withLlmCallLifecycle(ctx, model, providerId, systemPrompt, userPrompt, sig, noopUpdater, async () =>
    provider.generateChat(messages, mergedOptions),
  );
}
