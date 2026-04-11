/**
 * Task routes that share agentic SSE framing (design-system extract, inputs generate).
 */
import type { DesignSystemExtractRequest, DesignSystemExtractResponse, InputsGenerateRequest, InputsGenerateResponse } from './types';
import { parseApiErrorBody } from '../lib/error-utils';
import { SSE_EVENT_NAMES } from '../constants/sse-events';
import { readSseEventStream } from '../lib/sse-reader';
import {
  attachSseDiagWindow,
  createSseStreamDiagnostics,
} from '../lib/sse-diagnostics';
import { API_BASE } from './client-shared.ts';
import { dispatchGenerateStreamEvent, type GenerateStreamCallbacks } from './client-sse.ts';

export interface PostTaskStreamOptions {
  signal?: AbortSignal;
  agentic?: GenerateStreamCallbacks;
}

async function postTaskStream(
  path: string,
  body: unknown,
  options?: PostTaskStreamOptions,
): Promise<{ result: string }> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiErrorBody(text));
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response stream');

  let result: string | null = null;
  let errorMsg: string | null = null;

  const diag = createSseStreamDiagnostics();
  attachSseDiagWindow(diag);

  try {
    await readSseEventStream(reader, async (eventName, dataLine) => {
      try {
        const data = JSON.parse(dataLine) as Record<string, unknown>;
        if (eventName === SSE_EVENT_NAMES.task_result && typeof data.result === 'string') {
          result = data.result;
        } else if (eventName === SSE_EVENT_NAMES.error && typeof data.error === 'string') {
          errorMsg = data.error;
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
  } finally {
    diag.logClose();
  }

  if (errorMsg && !result) throw new Error(errorMsg);
  if (!result) throw new Error('Task completed without result');
  return { result };
}

export async function extractDesignSystem(
  req: DesignSystemExtractRequest,
  options?: PostTaskStreamOptions,
): Promise<DesignSystemExtractResponse> {
  return postTaskStream('/design-system/extract', req, options);
}

export async function generateInputContent(
  req: InputsGenerateRequest,
  options?: PostTaskStreamOptions,
): Promise<InputsGenerateResponse> {
  return postTaskStream('/inputs/generate', req, options);
}
