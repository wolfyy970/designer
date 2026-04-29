import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IncubateRequest } from '../types';
import { incubate, incubateStream } from '../client';
import { SSE_EVENT_NAMES } from '../../constants/sse-events';
import { LOST_STREAM_CONNECTION_MESSAGE } from '../client-sse-lifecycle';

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
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

const plan = {
  id: 'plan-1',
  specId: 's1',
  dimensions: [{ name: 'd', range: '1', isConstant: false }],
  hypotheses: [
    {
      id: 'h1',
      name: 'H',
      hypothesis: 'x',
      rationale: 'r',
      measurements: 'm',
      dimensionValues: {} as Record<string, string>,
    },
  ],
  generatedAt: '2020-01-01T00:00:00.000Z',
  incubatorModel: 'm1',
};

const minimalReq = {
  spec: {
    id: 's1',
    title: 't',
    sections: {
      'design-brief': {
        id: 'design-brief' as const,
        content: '',
        images: [],
        lastModified: '',
      },
      'existing-design': {
        id: 'existing-design' as const,
        content: '',
        images: [],
        lastModified: '',
      },
      'research-context': {
        id: 'research-context' as const,
        content: '',
        images: [],
        lastModified: '',
      },
      'objectives-metrics': {
        id: 'objectives-metrics' as const,
        content: '',
        images: [],
        lastModified: '',
      },
      'design-constraints': {
        id: 'design-constraints' as const,
        content: '',
        images: [],
        lastModified: '',
      },
    },
    version: 1,
    createdAt: '',
    lastModified: '',
  },
  providerId: 'openrouter',
  modelId: 'x/y',
} satisfies IncubateRequest;

describe('incubateStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves incubation plan from incubate_result and invokes callbacks', async () => {
    const onProgress = vi.fn();
    const onCode = vi.fn();
    const onIncubateResult = vi.fn();
    const onDone = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.progress, data: { status: 'Incubating…' } },
          { name: SSE_EVENT_NAMES.code, data: { code: '{"partial":' } },
          { name: SSE_EVENT_NAMES.incubate_result, data: plan },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );

    const out = await incubateStream(minimalReq, {
      onProgress,
      onCode,
      onIncubateResult,
      onDone,
    });

    expect(out.id).toBe('plan-1');
    expect(out.hypotheses).toHaveLength(1);
    expect(onProgress).toHaveBeenCalledWith('Incubating…');
    expect(onCode).toHaveBeenCalled();
    expect(onIncubateResult).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan-1' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/incubate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on HTTP error without reading SSE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('server error body', { status: 502 })),
    );
    await expect(incubateStream(minimalReq)).rejects.toThrow();
  });

  it('throws when SSE emits error', async () => {
    const onError = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.error, data: { error: 'Incubation failed' } },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );

    await expect(incubateStream(minimalReq, { onError })).rejects.toThrow(
      /Incubation failed|Compilation failed/,
    );
    expect(onError).toHaveBeenCalledWith('Incubation failed');
  });

  it('maps fetch/network failure to the lost-connection message', async () => {
    const onError = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(incubateStream(minimalReq, { onError })).rejects.toThrow(
      LOST_STREAM_CONNECTION_MESSAGE,
    );

    expect(onError).toHaveBeenCalledWith(LOST_STREAM_CONNECTION_MESSAGE);
  });

  it('throws when stream ends without incubate_result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([{ name: SSE_EVENT_NAMES.done, data: {} }])),
    );
    await expect(incubateStream(minimalReq)).rejects.toThrow(/Invalid server response/);
  });

  it('still resolves incubate_result when an earlier agentic event fails strict parse', async () => {
    const agenticOnError = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          // Missing `status` — fails generateSSEEventSchema (would previously cancel the reader).
          { name: SSE_EVENT_NAMES.progress, data: {} as Record<string, unknown> },
          { name: SSE_EVENT_NAMES.incubate_result, data: plan },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );

    const out = await incubateStream(minimalReq, {
      agentic: { onError: agenticOnError },
    });
    expect(out.id).toBe('plan-1');
    expect(agenticOnError).toHaveBeenCalled();
  });

  it('incubate() delegates to incubateStream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.incubate_result, data: plan },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );
    const out = await incubate(minimalReq);
    expect(out.specId).toBe('s1');
  });
});
