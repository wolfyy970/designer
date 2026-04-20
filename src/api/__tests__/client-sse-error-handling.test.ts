import { describe, it, expect, vi, afterEach } from 'vitest';
import type { HypothesisGenerateApiPayload } from '../types';
import { generateHypothesisStream } from '../client';
import { SSE_EVENT_NAMES } from '../../constants/sse-events';

function sseResponse(events: { name: string; data: Record<string, unknown> }[]): Response {
  const encoder = new TextEncoder();
  const chunk = events.map((e) => `event: ${e.name}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
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

describe('generateHypothesisStream error surfacing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls onError when SSE payload fails Zod validation', async () => {
    const onError = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            name: SSE_EVENT_NAMES.progress,
            data: { laneIndex: 0 },
          },
        ]),
      ),
    );

    await generateHypothesisStream(dummyBody, [
      { callbacks: { onError }, finalizeAfterStream: vi.fn().mockResolvedValue(undefined) },
    ]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/Invalid SSE event/);
  });

  it('calls onError when a stream callback throws', async () => {
    const onError = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            name: SSE_EVENT_NAMES.progress,
            data: { laneIndex: 0, status: 'ok' },
          },
        ]),
      ),
    );

    await generateHypothesisStream(dummyBody, [
      {
        callbacks: {
          onProgress: () => {
            throw new Error('boom');
          },
          onError,
        },
        finalizeAfterStream: vi.fn().mockResolvedValue(undefined),
      },
    ]);

    expect(onError).toHaveBeenCalledWith('boom');
  });

  it('calls onError for invalid JSON (single lane)', async () => {
    const onError = vi.fn();
    const encoder = new TextEncoder();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(`event: ${SSE_EVENT_NAMES.progress}\ndata: not-json\n\n`),
              );
              controller.close();
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await generateHypothesisStream(dummyBody, [
      { callbacks: { onError }, finalizeAfterStream: vi.fn().mockResolvedValue(undefined) },
    ]);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/Invalid JSON/);
  });

  it('notifies every lane on invalid JSON when multiplexed', async () => {
    const onError0 = vi.fn();
    const onError1 = vi.fn();
    const encoder = new TextEncoder();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(`event: ${SSE_EVENT_NAMES.progress}\ndata: not-json\n\n`),
              );
              controller.close();
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await generateHypothesisStream(dummyBody, [
      { callbacks: { onError: onError0 }, finalizeAfterStream: vi.fn().mockResolvedValue(undefined) },
      { callbacks: { onError: onError1 }, finalizeAfterStream: vi.fn().mockResolvedValue(undefined) },
    ]);

    expect(onError0).toHaveBeenCalledTimes(1);
    expect(onError1).toHaveBeenCalledTimes(1);
    expect(onError0.mock.calls[0][0]).toMatch(/Invalid JSON/);
  });

  it('notifies every lane when laneIndex is missing under multiplex', async () => {
    const onError0 = vi.fn();
    const onError1 = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            name: SSE_EVENT_NAMES.progress,
            data: { status: 'ok' },
          },
        ]),
      ),
    );

    await generateHypothesisStream(dummyBody, [
      { callbacks: { onError: onError0 }, finalizeAfterStream: vi.fn().mockResolvedValue(undefined) },
      { callbacks: { onError: onError1 }, finalizeAfterStream: vi.fn().mockResolvedValue(undefined) },
    ]);

    expect(onError0).toHaveBeenCalledTimes(1);
    expect(onError1).toHaveBeenCalledTimes(1);
    expect(onError0.mock.calls[0][0]).toMatch(/missing laneIndex/);
  });
});

describe('generateHypothesisStream finalize-after-stream sweep', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('finalizes every lane when the stream closes without lane_done', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([])));

    const finalize0 = vi.fn().mockResolvedValue(undefined);
    const finalize1 = vi.fn().mockResolvedValue(undefined);

    await generateHypothesisStream(dummyBody, [
      { callbacks: {}, finalizeAfterStream: finalize0 },
      { callbacks: {}, finalizeAfterStream: finalize1 },
    ]);

    expect(finalize0).toHaveBeenCalledTimes(1);
    expect(finalize1).toHaveBeenCalledTimes(1);
  });

  it('finalizes only lanes that did not emit lane_done', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.lane_done, data: { laneIndex: 0 } },
        ]),
      ),
    );

    const finalize0 = vi.fn().mockResolvedValue(undefined);
    const finalize1 = vi.fn().mockResolvedValue(undefined);

    await generateHypothesisStream(dummyBody, [
      { callbacks: {}, finalizeAfterStream: finalize0 },
      { callbacks: {}, finalizeAfterStream: finalize1 },
    ]);

    // lane 0 finalized via lane_done; lane 1 finalized via sweep
    expect(finalize0).toHaveBeenCalledTimes(1);
    expect(finalize1).toHaveBeenCalledTimes(1);
  });

  it('surfaces onError when sweep finalize throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([])));

    const onError = vi.fn();
    const finalize = vi.fn().mockRejectedValue(new Error('finalize boom'));

    await generateHypothesisStream(dummyBody, [
      { callbacks: { onError }, finalizeAfterStream: finalize },
    ]);

    expect(finalize).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/finalize boom/);
  });
});
