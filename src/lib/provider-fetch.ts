/**
 * Shared fetch utilities for OpenAI-compatible providers.
 * No environment-specific imports — safe for both client and server.
 */
import { z } from 'zod';
import type { ProviderModel, ChatResponse, ChatResponseMetadata } from '../types/provider';

const ChatCompletionSuccessSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.union([
        z.string(),
        z.array(z.record(z.string(), z.unknown())),
      ]),
    }).passthrough(),
    finish_reason: z.unknown().optional(),
  }).passthrough()).min(1),
  usage: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const ModelListSuccessSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())).optional().default([]),
}).passthrough();

/**
 * Extract the assistant message text from a chat completion response.
 * Handles string `content` and array parts (`{ type: 'text', text }`) used by OpenAI-compatible APIs.
 */
export function extractMessageText(data: Record<string, unknown>): string {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Record<string, unknown>;
      const typ = p.type;
      if (typ === 'text' && typeof p.text === 'string') {
        parts.push(p.text);
        continue;
      }
      if (typ === 'reasoning') {
        if (typeof p.text === 'string') parts.push(p.text);
        else if (typeof p.summary === 'string') parts.push(p.summary);
      }
    }
    return parts.join('');
  }
  return '';
}

/**
 * Fetch → parse → error-handling for OpenAI-compatible chat completion APIs.
 *
 * @param url           Full endpoint URL
 * @param body          Request body
 * @param errorMap      Status-code → user-friendly error message overrides
 * @param providerLabel Label for generic error messages (e.g. "OpenRouter")
 * @param extraHeaders  Additional headers (e.g. Authorization for server-side calls)
 */
export async function fetchChatCompletion(
  url: string,
  body: Record<string, unknown>,
  errorMap: Record<number, string>,
  providerLabel: string,
  extraHeaders?: Record<string, string>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const mapped = errorMap[response.status];
    if (mapped) throw new Error(mapped);
    throw new Error(`${providerLabel} API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json() as unknown;
  const parsed = ChatCompletionSuccessSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`${providerLabel} API returned an invalid chat completion response`);
  }
  return parsed.data;
}

/** Fetch and parse a model list from an OpenAI-compatible /models endpoint. */
export async function fetchModelList(
  url: string,
  mapFn: (models: Record<string, unknown>[]) => ProviderModel[],
  extraHeaders?: Record<string, string>,
): Promise<ProviderModel[]> {
  try {
    const response = await fetch(url, extraHeaders ? { headers: extraHeaders } : undefined);
    if (!response.ok) return [];
    const json = await response.json() as unknown;
    const parsed = ModelListSuccessSchema.safeParse(json);
    if (!parsed.success) return [];
    return mapFn(parsed.data.data);
  } catch {
    return [];
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Parse OpenAI-compatible chat completion JSON into ChatResponse.
 * OpenRouter documents prompt_tokens, completion_tokens, total_tokens, details, and cost.
 */
export function parseChatResponse(data: Record<string, unknown>): ChatResponse {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const firstChoice = choices?.[0] as Record<string, unknown> | undefined;
  const finishReason = firstChoice?.finish_reason as string | undefined;
  const rawText = extractMessageText(data);

  const usage = data.usage as Record<string, unknown> | undefined;
  const promptTok = num(usage?.prompt_tokens);
  const completionTok = num(usage?.completion_tokens);
  const totalTok = num(usage?.total_tokens);

  const promptDetails = usage?.prompt_tokens_details as Record<string, unknown> | undefined;
  const completionDetails = usage?.completion_tokens_details as Record<string, unknown> | undefined;

  const reasoningTok = num(completionDetails?.reasoning_tokens);
  const cachedTok = num(promptDetails?.cached_tokens);
  const cost = num(usage?.cost);

  const truncated = finishReason === 'length';
  const hasUsageNumbers =
    promptTok !== undefined ||
    completionTok !== undefined ||
    totalTok !== undefined ||
    reasoningTok !== undefined ||
    cachedTok !== undefined ||
    cost !== undefined;

  if (!hasUsageNumbers && !truncated) {
    return { raw: rawText };
  }

  const metadata: ChatResponseMetadata = { truncated };
  if (completionTok !== undefined) {
    metadata.completionTokens = completionTok;
    metadata.tokensUsed = completionTok;
  }
  if (promptTok !== undefined) metadata.promptTokens = promptTok;
  if (totalTok !== undefined) metadata.totalTokens = totalTok;
  if (reasoningTok !== undefined) metadata.reasoningTokens = reasoningTok;
  if (cachedTok !== undefined) metadata.cachedPromptTokens = cachedTok;
  if (cost !== undefined) metadata.costCredits = cost;

  return {
    raw: rawText,
    metadata,
  };
}
