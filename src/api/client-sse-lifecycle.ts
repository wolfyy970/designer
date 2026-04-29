import { normalizeError, parseApiErrorBody } from '../lib/error-utils';
import {
  attachSseDiagWindow,
  createSseStreamDiagnostics,
  type SseStreamDiagnostics,
} from '../lib/sse-diagnostics';
import { INVALID_SERVER_RESPONSE } from './client-shared';
import { parseHypothesisSseJson } from './client-sse-json';

export const LOST_STREAM_CONNECTION_MESSAGE =
  'Lost connection. This run cannot be resumed. Start it again.';

export function createClientSseDiagnostics(): SseStreamDiagnostics {
  const diag = createSseStreamDiagnostics();
  attachSseDiagWindow(diag);
  return diag;
}

export async function assertOkResponse(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const text = await response.text();
  throw new Error(normalizeError(parseApiErrorBody(text), fallback));
}

export function requireSseReader(response: Response): ReadableStreamDefaultReader<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  return reader;
}

export function parseSseObject(
  raw: string,
  eventName: string,
  diag?: SseStreamDiagnostics,
): Record<string, unknown> | null {
  const parsed = parseHypothesisSseJson(raw);
  if (parsed == null && diag) {
    diag.recordDrop('invalid_json', eventName);
  }
  return parsed;
}

export function invalidServerResponseError(): Error {
  return new Error(INVALID_SERVER_RESPONSE);
}

export function isIntentionalAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

export function isLikelyStreamConnectionLoss(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted || isIntentionalAbortError(err)) return false;
  if (err instanceof TypeError) return true;
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network error') ||
    message.includes('load failed') ||
    message.includes('body stream') ||
    message.includes('terminated') ||
    message.includes('connection') ||
    message.includes('socket') ||
    message.includes('broken pipe')
  );
}

export function lostStreamConnectionError(): Error {
  return new Error(LOST_STREAM_CONNECTION_MESSAGE);
}
