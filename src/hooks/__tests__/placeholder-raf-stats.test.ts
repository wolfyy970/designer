import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { batchedRafUpdater, type RafDevStats } from '../placeholder-session-state';

describe('batchedRafUpdater dev stats', () => {
  let rafCbs: FrameRequestCallback[];
  let nextId: number;

  beforeEach(() => {
    rafCbs = [];
    nextId = 1;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCbs.push(cb);
      return nextId++;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tracks schedule, flush, and cancel counts', () => {
    const stats: RafDevStats = { name: 'test', schedules: 0, framesExecuted: 0, cancelDiscards: 0 };
    const flush = vi.fn();
    const raf = batchedRafUpdater(flush, stats);

    raf.schedule();
    expect(stats.schedules).toBe(1);

    raf.schedule();
    expect(stats.schedules).toBe(1);

    rafCbs[0](0);
    expect(stats.framesExecuted).toBe(1);
    expect(flush).toHaveBeenCalledTimes(1);

    raf.schedule();
    expect(stats.schedules).toBe(2);

    raf.cancelOnly();
    expect(stats.cancelDiscards).toBe(1);

    raf.schedule();
    raf.flushPending();
    expect(stats.framesExecuted).toBe(2);
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
