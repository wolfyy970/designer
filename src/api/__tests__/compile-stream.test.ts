import { describe, it, expect, vi, afterEach } from 'vitest';
import type { CompileRequest } from '../types';
import { compile, compileStream } from '../client';
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
  compilerModel: 'm1',
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
} satisfies CompileRequest;

describe('compileStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves incubation plan from compile_result and invokes callbacks', async () => {
    const onProgress = vi.fn();
    const onCode = vi.fn();
    const onCompileResult = vi.fn();
    const onDone = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.progress, data: { status: 'Compiling…' } },
          { name: SSE_EVENT_NAMES.code, data: { code: '{"partial":' } },
          { name: SSE_EVENT_NAMES.compile_result, data: plan },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );

    const out = await compileStream(minimalReq, {
      onProgress,
      onCode,
      onCompileResult,
      onDone,
    });

    expect(out.id).toBe('plan-1');
    expect(out.hypotheses).toHaveLength(1);
    expect(onProgress).toHaveBeenCalledWith('Compiling…');
    expect(onCode).toHaveBeenCalled();
    expect(onCompileResult).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan-1' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/compile',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on HTTP error without reading SSE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('server error body', { status: 502 })),
    );
    await expect(compileStream(minimalReq)).rejects.toThrow();
  });

  it('throws when SSE emits error', async () => {
    const onError = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.error, data: { error: 'Compile failed' } },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );

    await expect(compileStream(minimalReq, { onError })).rejects.toThrow(
      /Compile failed|Compilation failed/,
    );
    expect(onError).toHaveBeenCalledWith('Compile failed');
  });

  it('throws when stream ends without compile_result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([{ name: SSE_EVENT_NAMES.done, data: {} }])),
    );
    await expect(compileStream(minimalReq)).rejects.toThrow(/Invalid server response/);
  });

  it('compile() delegates to compileStream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { name: SSE_EVENT_NAMES.compile_result, data: plan },
          { name: SSE_EVENT_NAMES.done, data: {} },
        ]),
      ),
    );
    const out = await compile(minimalReq);
    expect(out.specId).toBe('s1');
  });
});
