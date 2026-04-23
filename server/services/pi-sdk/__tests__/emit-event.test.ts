import { describe, it, expect, vi } from 'vitest';
import { emitEvent } from '../emit-event.ts';

describe('emitEvent', () => {
  it('forwards the event to onEvent', async () => {
    const onEvent = vi.fn();
    emitEvent(onEvent, { type: 'progress', payload: 'hello' });
    await Promise.resolve();
    expect(onEvent).toHaveBeenCalledWith({ type: 'progress', payload: 'hello' });
  });

  it('catches and logs async rejections, never rethrows', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const onEvent = vi.fn().mockRejectedValue(new Error('sse write failed'));
      expect(() => emitEvent(onEvent, { type: 'x' })).not.toThrow();
      // Wait for the microtask queue to drain the internal catch.
      await Promise.resolve();
      await Promise.resolve();
      expect(errSpy).toHaveBeenCalled();
      const [tag, msg] = errSpy.mock.calls[0];
      expect(tag).toBe('[pi-emit] onEvent failed');
      expect(typeof msg).toBe('string');
    } finally {
      errSpy.mockRestore();
    }
  });

  it('invokes onFail with the original rejection value (shorthand function arg)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const err = new Error('broken pipe');
      const onFail = vi.fn();
      emitEvent(() => Promise.reject(err), { type: 'x' }, onFail);
      await Promise.resolve();
      await Promise.resolve();
      expect(onFail).toHaveBeenCalledWith(err);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('honors a custom label for grep-stable log prefixes', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      emitEvent(() => Promise.reject(new Error('x')), { type: 'y' }, {
        label: '[bridge]',
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(errSpy.mock.calls[0][0]).toBe('[bridge] onEvent failed');
    } finally {
      errSpy.mockRestore();
    }
  });

  it('works with synchronous (non-promise) onEvent implementations', () => {
    const onEvent = vi.fn();
    emitEvent(onEvent, { type: 'file', path: '/x', content: 'y' });
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onEvent throws synchronously', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const onFail = vi.fn();
      expect(() =>
        emitEvent(
          () => {
            throw new Error('sync boom');
          },
          { type: 'x' },
          onFail,
        ),
      ).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();
      expect(onFail).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});
