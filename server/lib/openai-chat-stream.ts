import { normalizeError } from '../../src/lib/error-utils.ts';
import type { ChatResponse, ChatResponseMetadata } from '../../src/types/provider.ts';

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function appendDeltaContent(delta: Record<string, unknown>, out: { acc: string }): void {
  const c = delta.content;
  if (typeof c === 'string' && c.length > 0) {
    out.acc += c;
    return;
  }
  if (Array.isArray(c)) {
    for (const item of c) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Record<string, unknown>;
      const typ = p.type;
      if (typ === 'text' && typeof p.text === 'string') {
        out.acc += p.text;
      } else if (typ === 'reasoning') {
        if (typeof p.text === 'string') out.acc += p.text;
        else if (typeof p.summary === 'string') out.acc += p.summary;
      }
    }
    return;
  }
  const reasoning = delta.reasoning;
  if (typeof reasoning === 'string' && reasoning.length > 0) {
    out.acc += reasoning;
  }
}

function usageFromChunk(chunk: Record<string, unknown>): ChatResponseMetadata | undefined {
  const usage = chunk.usage as Record<string, unknown> | undefined;
  if (!usage) return undefined;
  const o: ChatResponseMetadata = {};
  const pt = num(usage.prompt_tokens);
  const ct = num(usage.completion_tokens);
  const tt = num(usage.total_tokens);
  if (pt !== undefined) o.promptTokens = pt;
  if (ct !== undefined) {
    o.completionTokens = ct;
    o.tokensUsed = ct;
  }
  if (tt !== undefined) o.totalTokens = tt;
  const pd = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  const cd = usage.completion_tokens_details as Record<string, unknown> | undefined;
  const rt = num(cd?.reasoning_tokens);
  const cached = num(pd?.cached_tokens);
  if (rt !== undefined) o.reasoningTokens = rt;
  if (cached !== undefined) o.cachedPromptTokens = cached;
  const cost = num(usage.cost);
  if (cost !== undefined) o.costCredits = cost;
  return Object.keys(o).length > 0 ? o : undefined;
}

export async function streamOpenAICompatibleChat(
  url: string,
  body: Record<string, unknown>,
  options: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    errorMap: Record<number, string>;
    providerLabel: string;
  },
  onTextDelta: (accumulated: string) => void | Promise<void>,
): Promise<ChatResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    const mapped = options.errorMap[response.status];
    if (mapped) throw new Error(mapped);
    throw new Error(`${options.providerLabel} API error (${response.status}): ${errText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${options.providerLabel}: empty response body`);

  const decoder = new TextDecoder();
  let buffer = '';
  let assembled = '';
  let lastMeta: ChatResponseMetadata | undefined;
  let finishReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.replace(/\r$/, '').trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;

      let chunk: Record<string, unknown>;
      try {
        chunk = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        continue;
      }

      const err = chunk.error as Record<string, unknown> | undefined;
      if (err != null) {
        const msg =
          typeof err === 'object' && typeof err.message === 'string'
            ? err.message
            : normalizeError(err, 'stream error');
        throw new Error(`${options.providerLabel}: ${msg}`);
      }

      const usage = usageFromChunk(chunk);
      if (usage) lastMeta = { ...lastMeta, ...usage };

      const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
      const choice0 = choices?.[0];
      if (choice0 && typeof choice0.finish_reason === 'string') {
        finishReason = choice0.finish_reason;
      }
      const delta = choice0?.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta === 'object') {
        const before = assembled;
        const bag = { acc: '' };
        appendDeltaContent(delta, bag);
        if (bag.acc.length > 0) {
          assembled += bag.acc;
          if (assembled !== before) {
            await onTextDelta(assembled);
          }
        }
      }
    }
  }

  const truncated = finishReason === 'length';
  const meta = lastMeta
    ? { ...lastMeta, truncated: truncated || lastMeta.truncated }
    : truncated
      ? { truncated }
      : undefined;

  return {
    raw: assembled,
    metadata: meta,
  };
}
