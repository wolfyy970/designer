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

  it('calls onError for invalid JSON data line on lane 0', async () => {
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
});
