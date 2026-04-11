export interface WriteGate {
  enqueue: (fn: () => Promise<void>) => Promise<void>;
}

/** Serialize async SSE writes so framing stays ordered under concurrent callbacks. */
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
