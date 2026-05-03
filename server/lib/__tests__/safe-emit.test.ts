import { describe, it, expect, vi } from 'vitest';
import { emitEvent } from '../safe-emit.ts';

describe('emitEvent', () => {
  it('forwards a sync event without invoking the failure path', () => {
    const onEvent = vi.fn();
    const onFail = vi.fn();
    emitEvent(onEvent, { type: 'x' }, { onFail });
    expect(onEvent).toHaveBeenCalledWith({ type: 'x' });
    expect(onFail).not.toHaveBeenCalled();
  });

  it('catches sync throws and routes the error to onFail', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const onFail = vi.fn();
      emitEvent(
        () => {
          throw new Error('boom');
        },
        { type: 'x' },
        { onFail },
      );
      expect(onFail).toHaveBeenCalledTimes(1);
      expect(onFail.mock.calls[0]![0]).toBeInstanceOf(Error);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('catches async rejections without producing unhandled rejections', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const onFail = vi.fn();
      emitEvent(
        async () => {
          throw new Error('async boom');
        },
        { type: 'x' },
        onFail,
      );
      // Microtask queue flush.
      await Promise.resolve();
      await Promise.resolve();
      expect(onFail).toHaveBeenCalledTimes(1);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('uses the supplied label in the console error prefix', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      emitEvent(
        () => {
          throw new Error('boom');
        },
        { type: 'x' },
        { label: '[bridge]' },
      );
      expect(errSpy.mock.calls[0]![0]).toBe('[bridge] onEvent failed');
    } finally {
      errSpy.mockRestore();
    }
  });
});
