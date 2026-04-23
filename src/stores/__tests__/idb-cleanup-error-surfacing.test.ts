/**
 * Locks in the contract of the internal `idbCleanup` helper in
 * `generation-store.ts`:
 *   1. Never rethrows (so awaited callers don't explode on quota / IDB faults).
 *   2. Logs rejections via `console.error` with the `[idb]` prefix — visible
 *      in production consoles. Mirrors the `[write-gate]`, `[bridge]`,
 *      `[pi-emit]` convention so grep across server + client catches failures.
 *
 * The helper is not exported, so we re-create a structurally identical
 * wrapper here and assert the contract. If the real helper changes shape,
 * the generation-store inline definition AND this test must update together.
 */
import { describe, it, expect, vi } from 'vitest';

function idbCleanup(p: Promise<void>) {
  return p.catch((err) => {
    console.error('[idb] cleanup failed:', err);
  });
}

describe('idbCleanup contract (mirrored from generation-store)', () => {
  it('swallows rejections (never rethrows)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(idbCleanup(Promise.reject(new Error('quota')))).resolves.toBeUndefined();
    } finally {
      errSpy.mockRestore();
    }
  });

  it('logs with `[idb]` prefix for grep/observability (production-visible)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const err = new Error('write failed');
      await idbCleanup(Promise.reject(err));
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(errSpy.mock.calls[0][0]).toBe('[idb] cleanup failed:');
      expect(errSpy.mock.calls[0][1]).toBe(err);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('does not log on resolved promises', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await idbCleanup(Promise.resolve());
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});
