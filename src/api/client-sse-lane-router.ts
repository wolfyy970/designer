import { normalizeError } from '../lib/error-utils';
import type { GenerateStreamCallbacks } from './client-sse';

export interface HypothesisLaneSession {
  callbacks: GenerateStreamCallbacks;
  finalizeAfterStream: () => Promise<void>;
}

/** Stream-level SSE failure: every active lane gets the same error (avoids mis-attributing to lane 0). */
export function notifyAllHypothesisLanesError(
  lanes: HypothesisLaneSession[],
  err: unknown,
): void {
  const msg = normalizeError(err);
  for (const lane of lanes) {
    lane.callbacks.onError?.(msg);
  }
}

export function callbacksForHypothesisLane(
  lanes: HypothesisLaneSession[],
  laneIndex: number | undefined,
): GenerateStreamCallbacks | undefined {
  return typeof laneIndex === 'number' && lanes[laneIndex]
    ? lanes[laneIndex].callbacks
    : lanes[0]?.callbacks;
}

export async function finalizeMissingHypothesisLanes(
  lanes: HypothesisLaneSession[],
  finalizedLaneIndices: ReadonlySet<number>,
): Promise<void> {
  for (let i = 0; i < lanes.length; i++) {
    if (finalizedLaneIndices.has(i)) continue;
    try {
      await lanes[i].finalizeAfterStream();
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[generate SSE] finalize after stream end (missing lane_done)', i, err);
      }
      lanes[i].callbacks.onError?.(
        normalizeError(
          err instanceof Error ? err : new Error('Stream ended before lane completed'),
          'Generation stream ended unexpectedly',
        ),
      );
    }
  }
}
