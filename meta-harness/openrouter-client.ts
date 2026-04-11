/**
 * Shared OpenRouter chat-completions fetch (auth, timeout merge, errors, JSON parse).
 */
import { z } from 'zod';
import { OPENROUTER_CHAT_URL, OPENROUTER_HTTP_ERROR_BODY_MAX } from './constants.ts';

/** OpenAI-compatible tool definition passed to `tools` on chat/completions. */
export type OpenRouterFunctionTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

const OpenRouterToolCallSchema = z.object({
  id: z.string(),
  type: z.string(),
  function: z.object({ name: z.string(), arguments: z.string() }),
});

const OpenRouterMessageSchema = z.object({
  content: z.union([z.string(), z.null()]).optional(),
  tool_calls: z.array(OpenRouterToolCallSchema).optional(),
});

const OpenRouterChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: OpenRouterMessageSchema,
      }),
    )
    .min(1),
});

type OpenRouterChatResponse = z.infer<typeof OpenRouterChatResponseSchema>;

/** Narrow an OpenRouter JSON body to the chat-completions shape we consume; throws on invalid. */
export function parseOpenRouterChatResponse(data: unknown): OpenRouterChatResponse {
  const r = OpenRouterChatResponseSchema.safeParse(data);
  if (!r.success) {
    throw new Error(`OpenRouter: invalid response shape: ${r.error.message}`);
  }
  return r.data;
}

type FetchOpenRouterChatOptions = {
  apiKey: string;
  /** Full request body (must include `model`, `messages`, and optionally `tools`, `tool_choice`, `temperature`, …) */
  requestBody: Record<string, unknown>;
  signal?: AbortSignal;
  /** When set, combined with `signal` via AbortSignal.any with TimeoutSignal */
  timeoutMs?: number;
};

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
export async function fetchOpenRouterChatJson(options: FetchOpenRouterChatOptions): Promise<unknown> {
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

/** POST chat/completions and return a validated {@link OpenRouterChatResponse}. */
export async function fetchOpenRouterChat(options: FetchOpenRouterChatOptions): Promise<OpenRouterChatResponse> {
  const raw = await fetchOpenRouterChatJson(options);
  return parseOpenRouterChatResponse(raw);
}
