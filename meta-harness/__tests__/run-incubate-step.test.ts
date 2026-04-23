import { describe, it, expect, vi, afterEach } from 'vitest';
import { runIncubateStep } from '../incubate-step.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';

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

const planPayload = {
  id: 'plan-1',
  specId: 's1',
  dimensions: [] as { name: string; range: string; isConstant: boolean }[],
  hypotheses: [
    {
      id: 'h1',
      name: 'H',
      hypothesis: 'x',
      rationale: '',
      measurements: '',
      dimensionValues: {} as Record<string, string>,
    },
  ],
  generatedAt: '2020-01-01T00:00:00.000Z',
  incubatorModel: 'm',
};

describe('runIncubateStep (SSE)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses incubate_result and forwards onWireEvent', async () => {
    const events: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.progress, data: { status: 'Incubating…' } },
          { name: SSE_EVENT_NAMES.incubate_result, data: planPayload },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );

    const plan = await runIncubateStep('http://localhost:4731/api', { foo: 1 }, {
      onWireEvent: (ev) => {
        events.push(ev);
      },
    });

    expect(plan.id).toBe('plan-1');
    expect(plan.hypotheses).toHaveLength(1);
    expect(events).toContain(SSE_EVENT_NAMES.progress);
    expect(events).toContain(SSE_EVENT_NAMES.incubate_result);
    expect(events).toContain(SSE_EVENT_NAMES.done);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'http://localhost:4731/api/incubate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { status: 503 })));
    await expect(runIncubateStep('http://h/api', {})).rejects.toThrow(/POST \/incubate 503/);
  });

  it('throws when incubate_result never arrives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([{ name: SSE_EVENT_NAMES.done, data: {} }])),
    );
    await expect(runIncubateStep('http://h/api', {})).rejects.toThrow(/without incubate_result/);
  });

  it('throws on SSE error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.error, data: { error: 'bad incubate' } },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );
    await expect(runIncubateStep('http://h/api', {})).rejects.toThrow(/bad incubate/);
  });

  it('throws when incubate_result fails IncubateResponseSchema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.incubate_result, data: { notAPlan: true } },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );
    await expect(runIncubateStep('http://h/api', {})).rejects.toThrow(/Invalid incubate_result payload/);
  });
});
