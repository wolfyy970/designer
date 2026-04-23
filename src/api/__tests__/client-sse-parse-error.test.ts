/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ZodError } from 'zod';
import type { HypothesisGenerateApiPayload } from '../types';
import { generateHypothesisStream, dispatchGenerateStreamEvent } from '../client';
import { SSE_EVENT_NAMES } from '../../constants/sse-events';

/** Pure-dispatch variant: isolates the `onParseError` contract from stream plumbing. */
describe('dispatchGenerateStreamEvent — onParseError contract', () => {
  it('invokes onParseError with the ZodError when payload fails schema', () => {
    const onParseError = vi.fn<(name: string, data: Record<string, unknown>, err: ZodError) => void>();
    const onError = vi.fn();

    const bad = { laneIndex: 0 }; // progress requires `status`
    const ok = dispatchGenerateStreamEvent(SSE_EVENT_NAMES.progress, bad, {
      onParseError,
      onError,
    });

    expect(ok).toBe(false);
    expect(onParseError).toHaveBeenCalledTimes(1);
    const [name, data, err] = onParseError.mock.calls[0];
    expect(name).toBe(SSE_EVENT_NAMES.progress);
    expect(data).toEqual(bad);
    expect(typeof err.flatten).toBe('function');
    // onError also fires so callers without onParseError still surface the failure.
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onParseError when payload is valid', () => {
    const onParseError = vi.fn();
    const onProgress = vi.fn();

    const ok = dispatchGenerateStreamEvent(
      SSE_EVENT_NAMES.progress,
      { status: 'Building…' },
      { onParseError, onProgress },
    );

    expect(ok).toBe(true);
    expect(onParseError).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith('Building…');
  });
});

/** Stream integration: onParseError fires inside the hypothesis stream. */
function sseResponse(events: { name: string; data: Record<string, unknown> }[]): Response {
  const encoder = new TextEncoder();
  const chunk = events
    .map((e) => `event: ${e.name}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

const dummyBody = {} as HypothesisGenerateApiPayload;

describe('generateHypothesisStream — onParseError propagation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls onParseError alongside onError for a malformed event, then finalizes the lane', async () => {
    const onParseError = vi.fn();
    const onError = vi.fn();
    const finalizeAfterStream = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            name: SSE_EVENT_NAMES.progress,
            // missing required `status` — fails Zod
            data: { laneIndex: 0 },
          },
        ]),
      ),
    );

    await generateHypothesisStream(dummyBody, [
      { callbacks: { onParseError, onError }, finalizeAfterStream },
    ]);

    expect(onParseError).toHaveBeenCalledTimes(1);
    expect(onParseError.mock.calls[0][0]).toBe(SSE_EVENT_NAMES.progress);
    expect(onError).toHaveBeenCalledTimes(1);
    // Stream cancels on parse failure; post-stream sweep still finalizes the un-finalized lane.
    expect(finalizeAfterStream).toHaveBeenCalledTimes(1);
  });
});
