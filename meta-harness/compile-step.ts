/**
 * POST /api/compile — SSE (`compile_result` carries incubation plan).
 */
import type { IncubationPlan } from '../src/types/compiler.ts';
import { readSseEventStream } from '../src/lib/sse-reader.ts';
import { SSE_EVENT_NAMES } from '../src/constants/sse-events.ts';
import { CompileResponseSchema } from '../src/api/response-schemas.ts';
import { parseSseJsonObject } from './sse-utils.ts';
import { COMPILE_ERROR_BODY_MAX } from './constants.ts';

export async function runCompileStep(
  apiBaseUrl: string,
  body: Record<string, unknown>,
  options?: {
    signal?: AbortSignal;
    onWireEvent?: (event: string, payload: unknown) => void;
  },
): Promise<IncubationPlan> {
  const base = apiBaseUrl.replace(/\/$/, '');
  const url = `${base}/compile`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST /compile ${res.status}: ${t.slice(0, COMPILE_ERROR_BODY_MAX)}`);
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
        parsed && typeof parsed.error === 'string' ? parsed.error : dataLine || 'Compile error';
      streamError = msg;
      options?.onWireEvent?.(ev, parsed ?? { error: msg });
      return;
    }

    if (ev === SSE_EVENT_NAMES.compile_result) {
      if (parsed) {
        const r = CompileResponseSchema.safeParse(parsed);
        if (r.success) {
          plan = r.data;
        } else {
          streamError = 'Invalid compile_result payload';
        }
      } else {
        streamError = 'Invalid compile_result payload';
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
    throw new Error('Compile stream ended without compile_result');
  }
  return plan;
}
