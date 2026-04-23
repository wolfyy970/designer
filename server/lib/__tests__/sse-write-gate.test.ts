import { describe, expect, it, vi } from 'vitest';
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

  it('logs rejected tasks to console.error for production visibility', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const gate = createWriteGate();
      const err = new Error('write failed');
      await expect(
        gate.enqueue(async () => {
          throw err;
        }),
      ).rejects.toThrow('write failed');
      // Tail-catch runs after the rejected `next` settles — wait one microtask.
      await Promise.resolve();
      await Promise.resolve();
      expect(errSpy).toHaveBeenCalledWith('[write-gate]', err);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('does not log when the rejection value is null (intentional silent skip)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const gate = createWriteGate();
      await expect(
        gate.enqueue(async () => {
          throw null;
        }),
      ).rejects.toBeNull();
      await Promise.resolve();
      await Promise.resolve();
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});
