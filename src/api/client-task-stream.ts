/**
 * Task routes that share agentic SSE framing (design-system extract, inputs generate).
 */
import type {
  DesignSystemExtractRequest,
  DesignSystemExtractResponse,
  InputsGenerateRequest,
  InputsGenerateResponse,
  InternalContextGenerateRequest,
  InternalContextGenerateResponse,
} from './types';
import type { z } from 'zod';
import { parseApiErrorBody } from '../lib/error-utils';
import { SSE_EVENT_NAMES } from '../constants/sse-events';
import { readSseEventStream } from '../lib/sse-reader';
import {
  attachSseDiagWindow,
  createSseStreamDiagnostics,
} from '../lib/sse-diagnostics';
import { API_BASE } from './client-shared.ts';
import { dispatchGenerateStreamEvent, type GenerateStreamCallbacks } from './client-sse.ts';
import {
  isLikelyStreamConnectionLoss,
  lostStreamConnectionError,
} from './client-sse-lifecycle.ts';
import {
  isOpenRouterCreditExhaustionLike,
  notifyOpenRouterBudgetRefresh,
} from '../lib/openrouter-budget.ts';
import {
  DesignSystemExtractResponseSchema,
  InputsGenerateResponseSchema,
  InternalContextGenerateResponseSchema,
} from './response-schemas.ts';

export interface PostTaskStreamOptions {
  signal?: AbortSignal;
  agentic?: GenerateStreamCallbacks;
}

async function postTaskStream(
  path: string,
  body: unknown,
  responseSchema: z.ZodType<{ result: string }>,
  options?: PostTaskStreamOptions,
): Promise<{ result: string }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
  } catch (err) {
    if (isLikelyStreamConnectionLoss(err, options?.signal)) {
      const lost = lostStreamConnectionError();
      options?.agentic?.onError?.(lost.message);
      throw lost;
    }
    throw err;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorBody(text));
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response stream');

  let taskPayload: unknown = null;
  let errorMsg: string | null = null;

  const diag = createSseStreamDiagnostics();
  attachSseDiagWindow(diag);

  try {
    await readSseEventStream(reader, async (eventName, dataLine) => {
      try {
        const data = JSON.parse(dataLine) as Record<string, unknown>;
        if (eventName === SSE_EVENT_NAMES.task_result) {
          taskPayload = data;
        } else if (eventName === SSE_EVENT_NAMES.error && typeof data.error === 'string') {
          errorMsg = data.error;
          if (isOpenRouterCreditExhaustionLike(data.error)) {
            notifyOpenRouterBudgetRefresh();
          }
          options?.agentic?.onError?.(data.error);
        } else if (eventName === SSE_EVENT_NAMES.done) {
          options?.agentic?.onDone?.();
        } else if (options?.agentic) {
          const ok = dispatchGenerateStreamEvent(eventName, data, options.agentic, diag);
          if (!ok) return false;
        } else if (import.meta.env.DEV) {
          console.debug('[api] postTaskStream SSE event (dev: not surfaced)', eventName, dataLine);
        }
      } catch (parseErr) {
        if (import.meta.env.DEV) {
          console.warn('[api] postTaskStream malformed SSE line', dataLine, parseErr);
        }
      }
    });
  } catch (err) {
    if (isLikelyStreamConnectionLoss(err, options?.signal)) {
      const lost = lostStreamConnectionError();
      options?.agentic?.onError?.(lost.message);
      throw lost;
    }
    throw err;
  } finally {
    diag.logClose();
  }

  if (errorMsg && taskPayload == null) throw new Error(errorMsg);
  const parsed = responseSchema.safeParse(taskPayload);
  if (!parsed.success) {
    throw new Error(`Invalid task result payload: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function extractDesignSystem(
  req: DesignSystemExtractRequest,
  options?: PostTaskStreamOptions,
): Promise<DesignSystemExtractResponse> {
  return postTaskStream('/design-system/extract', req, DesignSystemExtractResponseSchema, options);
}

export async function generateInputContent(
  req: InputsGenerateRequest,
  options?: PostTaskStreamOptions,
): Promise<InputsGenerateResponse> {
  return postTaskStream('/inputs/generate', req, InputsGenerateResponseSchema, options);
}

export async function generateInternalContext(
  req: InternalContextGenerateRequest,
  options?: PostTaskStreamOptions,
): Promise<InternalContextGenerateResponse> {
  return postTaskStream('/internal-context/generate', req, InternalContextGenerateResponseSchema, options);
}
