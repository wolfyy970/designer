/**
 * POST /api/incubate — SSE (`incubate_result` carries incubation plan).
 */
import type { IncubationPlan } from '../src/types/incubator.ts';
import { readSseEventStream } from '../src/lib/sse-reader.ts';
import { SSE_EVENT_NAMES } from '../src/constants/sse-events.ts';
import { IncubateResponseSchema } from '../src/api/response-schemas.ts';
import { parseSseJsonObject } from './sse-utils.ts';
import { INCUBATE_ERROR_BODY_MAX } from './constants.ts';

export async function runIncubateStep(
  apiBaseUrl: string,
  body: Record<string, unknown>,
  options?: {
    signal?: AbortSignal;
    onWireEvent?: (event: string, payload: unknown) => void;
  },
): Promise<IncubationPlan> {
  const base = apiBaseUrl.replace(/\/$/, '');
  const url = `${base}/incubate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST /incubate ${res.status}: ${t.slice(0, INCUBATE_ERROR_BODY_MAX)}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  let plan: IncubationPlan | undefined;
  let streamError: string | undefined;

  await readSseEventStream(reader, async (eventName, dataLine) => {
    const ev = eventName.trim();
    const parsed = parseSseJsonObject(dataLine);

    if (ev === SSE_EVENT_NAMES.error) {
      const msg =
        parsed && typeof parsed.error === 'string' ? parsed.error : dataLine || 'Incubate error';
      streamError = msg;
      options?.onWireEvent?.(ev, parsed ?? { error: msg });
      return;
    }

    if (ev === SSE_EVENT_NAMES.incubate_result) {
      if (parsed) {
        const r = IncubateResponseSchema.safeParse(parsed);
        if (r.success) {
          plan = r.data;
        } else {
          streamError = 'Invalid incubate_result payload';
        }
      } else {
        streamError = 'Invalid incubate_result payload';
      }
      options?.onWireEvent?.(ev, parsed ?? dataLine);
      return;
    }

    options?.onWireEvent?.(ev, parsed ?? dataLine);
  });

  if (streamError) {
    throw new Error(streamError);
  }
  if (!plan) {
    throw new Error('Incubate stream ended without incubate_result');
  }
  return plan;
}
