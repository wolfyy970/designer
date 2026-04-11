import { describe, expect, it } from 'vitest';
import { createWriteGate } from '../sse-write-gate.ts';

describe('createWriteGate', () => {
  it('runs enqueued tasks sequentially in submission order', async () => {
    const order: string[] = [];
    const gate = createWriteGate();
    const p1 = gate.enqueue(async () => {
      order.push('a');
    });
    const p2 = gate.enqueue(async () => {
      order.push('b');
    });
    await Promise.all([p1, p2]);
    expect(order).toEqual(['a', 'b']);
  });

  it('continues the chain after a rejected task (tail reset)', async () => {
    const gate = createWriteGate();
    const log: string[] = [];
    await gate.enqueue(async () => {
      log.push('first');
    });
    await expect(
      gate.enqueue(async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    await gate.enqueue(async () => {
      log.push('after');
    });
    expect(log).toEqual(['first', 'after']);
  });
});
