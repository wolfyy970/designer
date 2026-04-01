import { describe, it, expect, vi } from 'vitest';
import { readSseEventStream } from '../sse-reader';

function chunksReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(chunks[i++]));
    },
  }).getReader();
}

describe('readSseEventStream', () => {
  it('pairs event and data lines across chunk boundaries', async () => {
    const received: { ev: string; data: string }[] = [];
    const reader = chunksReader(['event: pro', 'gress\ndata: {"a":1}\n', 'event: code\ndata: {}\n']);
    await readSseEventStream(reader, (ev, data) => {
      received.push({ ev, data });
    });
    expect(received).toEqual([
      { ev: 'progress', data: '{"a":1}' },
      { ev: 'code', data: '{}' },
    ]);
  });

  it('invokes async handlers sequentially', async () => {
    const order: number[] = [];
    const reader = chunksReader(['event: a\ndata: 1\n', 'event: b\ndata: 2\n']);
    await readSseEventStream(reader, async () => {
      order.push(1);
      await Promise.resolve();
      order.push(2);
    });
    expect(order).toEqual([1, 2, 1, 2]);
  });

  it('handles empty data lines', async () => {
    const fn = vi.fn();
    const reader = chunksReader(['event: done\ndata: {}\n']);
    await readSseEventStream(reader, fn);
    expect(fn).toHaveBeenCalledWith('done', '{}');
  });
});
