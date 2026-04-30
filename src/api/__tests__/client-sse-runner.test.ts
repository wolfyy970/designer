/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSseStream } from '../client-sse-runner';
import { LOST_STREAM_CONNECTION_MESSAGE } from '../client-sse-lifecycle';

const diagLogClose = vi.hoisted(() => vi.fn());

vi.mock('../../lib/sse-diagnostics', () => ({
  attachSseDiagWindow: vi.fn(),
  createSseStreamDiagnostics: vi.fn(() => ({
    recordReceived: vi.fn(),
    recordDrop: vi.fn(),
    summary: vi.fn(() => ({ durationMs: 0, byEvent: {}, drops: 0, dropReasons: [] })),
    logClose: diagLogClose,
  })),
}));

function sseResponse(events: { name: string; data: Record<string, unknown> }[]): Response {
  const encoder = new TextEncoder();
  const chunk = events.map((event) => `event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`).join('');
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('runSseStream', () => {
  beforeEach(() => {
    diagLogClose.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts JSON and passes stream events to the adapter', async () => {
    const onEvent = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([{ name: 'progress', data: { status: 'ok' } }])));

    await runSseStream({
      path: '/example',
      body: { id: '1' },
      fallbackError: 'Failed',
      onEvent,
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/example',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '1' }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith('progress', '{"status":"ok"}', expect.any(Object));
    expect(diagLogClose).toHaveBeenCalledTimes(1);
  });

  it('normalizes HTTP errors through the shared response policy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream down', { status: 502 })));

    await expect(
      runSseStream({
        path: '/example',
        body: {},
        fallbackError: 'Fallback failed',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow(/upstream down|Fallback failed/);

    expect(diagLogClose).not.toHaveBeenCalled();
  });

  it('preserves the existing no-body error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    await expect(
      runSseStream({
        path: '/example',
        body: {},
        fallbackError: 'Failed',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('No response body');

    expect(diagLogClose).not.toHaveBeenCalled();
  });

  it('maps fetch network failures to lost connection and calls the endpoint hook', async () => {
    const onConnectionLoss = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(
      runSseStream({
        path: '/example',
        body: {},
        fallbackError: 'Failed',
        onConnectionLoss,
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow(LOST_STREAM_CONNECTION_MESSAGE);

    expect(onConnectionLoss).toHaveBeenCalledWith(expect.objectContaining({ message: LOST_STREAM_CONNECTION_MESSAGE }));
    expect(diagLogClose).not.toHaveBeenCalled();
  });

  it('does not treat intentional abort as connection loss', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    const onConnectionLoss = vi.fn();
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));

    await expect(
      runSseStream({
        path: '/example',
        body: {},
        signal: controller.signal,
        fallbackError: 'Failed',
        onConnectionLoss,
        onEvent: vi.fn(),
      }),
    ).rejects.toBe(abort);

    expect(onConnectionLoss).not.toHaveBeenCalled();
  });

  it('maps reader failures to lost connection and still closes diagnostics', async () => {
    const onConnectionLoss = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            pull() {
              throw new TypeError('terminated');
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      runSseStream({
        path: '/example',
        body: {},
        fallbackError: 'Failed',
        onConnectionLoss,
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow(LOST_STREAM_CONNECTION_MESSAGE);

    expect(onConnectionLoss).toHaveBeenCalledWith(expect.objectContaining({ message: LOST_STREAM_CONNECTION_MESSAGE }));
    expect(diagLogClose).toHaveBeenCalledTimes(1);
  });
});
