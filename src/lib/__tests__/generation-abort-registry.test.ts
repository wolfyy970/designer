import { describe, expect, it, vi } from 'vitest';
import {
  abortGenerationForStrategy,
  clearGenerationAbortController,
  GENERATION_STOPPED_MESSAGE,
  isAbortError,
  swapGenerationAbortController,
} from '../generation-abort-registry';

describe('generation-abort-registry', () => {
  it('swapGenerationAbortController aborts previous controller and returns a fresh signal', () => {
    const first = swapGenerationAbortController('vs-a');
    const spy = vi.fn();
    first.signal.addEventListener('abort', spy);
    const second = swapGenerationAbortController('vs-a');
    expect(spy).toHaveBeenCalled();
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it('clearGenerationAbortController removes map entry when controller matches current', () => {
    const c = swapGenerationAbortController('vs-b');
    clearGenerationAbortController('vs-b', c);
    const next = swapGenerationAbortController('vs-b');
    expect(next.signal.aborted).toBe(false);
  });

  it('clearGenerationAbortController ignores a superseded controller', () => {
    const stale = swapGenerationAbortController('vs-x');
    const current = swapGenerationAbortController('vs-x');
    clearGenerationAbortController('vs-x', stale);
    expect(current.signal.aborted).toBe(false);
    abortGenerationForStrategy('vs-x');
  });

  it('abortGenerationForStrategy aborts and clears', () => {
    const c = swapGenerationAbortController('vs-c');
    const spy = vi.fn();
    c.signal.addEventListener('abort', spy);
    abortGenerationForStrategy('vs-c');
    expect(spy).toHaveBeenCalled();
    const next = swapGenerationAbortController('vs-c');
    expect(next.signal.aborted).toBe(false);
  });

  it('isAbortError recognizes DOMException and Error AbortError', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    const e = new Error('aborted');
    e.name = 'AbortError';
    expect(isAbortError(e)).toBe(true);
    expect(isAbortError(new Error('other'))).toBe(false);
  });

  it('GENERATION_STOPPED_MESSAGE is stable', () => {
    expect(GENERATION_STOPPED_MESSAGE).toBe('Generation stopped.');
  });
});
