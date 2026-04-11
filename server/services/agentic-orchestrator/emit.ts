import { normalizeError } from '../../../src/lib/error-utils.ts';
import { env } from '../../env.ts';
import type { AgenticOrchestratorEvent, AgenticOrchestratorOptions } from './types.ts';

/** Mirrors Pi bridge: SSE delivery failures abort the run instead of unhandled rejections. */
export type StreamEmissionContext = {
  onStream: AgenticOrchestratorOptions['onStream'];
  onDeliveryFailure?: () => void;
};

export async function emitOrchestratorEvent(
  ctx: StreamEmissionContext,
  e: AgenticOrchestratorEvent,
): Promise<void> {
  try {
    await ctx.onStream(e);
  } catch (err) {
    if (env.isDev) {
      console.error('[agentic-orchestrator] onStream failed', normalizeError(err), err);
    }
    ctx.onDeliveryFailure?.();
  }
}
