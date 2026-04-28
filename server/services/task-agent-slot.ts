import { acquireAgenticSlotOrReject, releaseAgenticSlot } from '../lib/agentic-concurrency.ts';

export async function acquireTaskAgentSlot(): Promise<boolean> {
  return acquireAgenticSlotOrReject();
}

export function releaseTaskAgentSlot(): void {
  releaseAgenticSlot();
}
