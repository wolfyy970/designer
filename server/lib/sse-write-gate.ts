export interface WriteGate {
  enqueue: (fn: () => Promise<void>) => Promise<void>;
}

/**
 * Serialize async SSE writes so framing stays ordered under concurrent callbacks.
 *
 * Rejection handling: the **caller** sees the rejection (via the returned promise).
 * The internal `tail.catch` exists only to reset the chain so subsequent enqueues
 * still run. `console.error` surfaces non-null errors in production; `null` is
 * skipped so callers can reject with a sentinel to quietly drop downstream writes.
 */
export function createWriteGate(): WriteGate {
  let tail = Promise.resolve();
  return {
    enqueue(fn: () => Promise<void>): Promise<void> {
      const next = tail.then(fn);
      tail = next.catch((e: unknown) => {
        if (e != null) {
          console.error('[write-gate]', e);
        }
      });
      return next;
    },
  };
}
