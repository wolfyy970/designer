/**
 * Shared OpenRouter chat-completions fetch (auth, timeout merge, errors, JSON parse).
 */
import { OPENROUTER_CHAT_URL, OPENROUTER_HTTP_ERROR_BODY_MAX } from './constants.ts';

/** Merge an optional caller `signal` with an optional wall-clock timeout (for fetch / long HTTP). */
export function mergeHttpTimeoutSignal(
  outer: AbortSignal | undefined,
  timeoutMs: number | undefined,
): AbortSignal | undefined {
  if (timeoutMs == null || timeoutMs <= 0) return outer;
  const inner = AbortSignal.timeout(timeoutMs);
  if (!outer) return inner;
  return AbortSignal.any([outer, inner]);
}

/**
 * POST JSON to OpenRouter chat completions; returns parsed JSON body.
 * @throws Error on non-OK HTTP or JSON parse failure on success responses
 */
export async function fetchOpenRouterChatJson(options: {
  apiKey: string;
  /** Full request body (must include `model`, `messages`, and optionally `tools`, `tool_choice`, `temperature`, …) */
  requestBody: Record<string, unknown>;
  signal?: AbortSignal;
  /** When set, combined with `signal` via AbortSignal.any with TimeoutSignal */
  timeoutMs?: number;
}): Promise<unknown> {
  const signal = mergeHttpTimeoutSignal(options.signal, options.timeoutMs);
  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options.requestBody),
    signal,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, OPENROUTER_HTTP_ERROR_BODY_MAX)}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error('OpenRouter: response body is not valid JSON');
  }
  return json;
}
