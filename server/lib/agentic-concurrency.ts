/**
 * Per-process cap on concurrent agentic orchestration runs (avoids runaway LLM + memory use).
 * Uses a serialized gate so acquire/release cannot race with V8 interleaving.
 */
import { env } from '../env.ts';

let activeSlots = 0;
let gateChain: Promise<void> = Promise.resolve();

export async function acquireAgenticSlotOrReject(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    gateChain = gateChain.then(() => {
      const max = env.MAX_CONCURRENT_AGENTIC_RUNS;
      if (activeSlots >= max) {
        resolve(false);
        return;
      }
      activeSlots += 1;
      resolve(true);
    });
  });
}

export function releaseAgenticSlot(): void {
  gateChain = gateChain.then(() => {
    activeSlots = Math.max(0, activeSlots - 1);
  });
}
