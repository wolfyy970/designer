import { readSseEventStream } from '../lib/sse-reader';
import type { SseStreamDiagnostics } from '../lib/sse-diagnostics';
import { API_BASE } from './client-shared.ts';
import {
  assertOkResponse,
  createClientSseDiagnostics,
  isLikelyStreamConnectionLoss,
  lostStreamConnectionError,
  requireSseReader,
} from './client-sse-lifecycle';

export interface RunSseStreamOptions {
  path: string;
  body: unknown;
  signal?: AbortSignal;
  fallbackError: string;
  onConnectionLoss?: (error: Error) => void;
  onEvent: (
    eventName: string,
    raw: string,
    diag: SseStreamDiagnostics,
  ) => void | false | Promise<void | false>;
}

export async function runSseStream({
  path,
  body,
  signal,
  fallbackError,
  onConnectionLoss,
  onEvent,
}: RunSseStreamOptions): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (isLikelyStreamConnectionLoss(err, signal)) {
      const lost = lostStreamConnectionError();
      onConnectionLoss?.(lost);
      throw lost;
    }
    throw err;
  }

  await assertOkResponse(response, fallbackError);
  const reader = requireSseReader(response);
  const diag = createClientSseDiagnostics();

  try {
    await readSseEventStream(reader, async (eventName, raw) => onEvent(eventName, raw, diag));
  } catch (err) {
    if (isLikelyStreamConnectionLoss(err, signal)) {
      const lost = lostStreamConnectionError();
      onConnectionLoss?.(lost);
      throw lost;
    }
    throw err;
  } finally {
    diag.logClose();
  }
}
