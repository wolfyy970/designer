/**
 * One AbortController per variant strategy lane while a hypothesis generation request is in flight.
 * Stop UI calls `abortGenerationForStrategy`; `useHypothesisGeneration` swaps/clears on start/finish.
 */

const controllers = new Map<string, AbortController>();

/** User-visible error text for client-aborted runs (must stay in sync with catch handling). */
export const GENERATION_STOPPED_MESSAGE = 'Generation stopped.';

export function swapGenerationAbortController(variantStrategyId: string): AbortController {
  const prev = controllers.get(variantStrategyId);
  prev?.abort();
  const next = new AbortController();
  controllers.set(variantStrategyId, next);
  return next;
}

export function clearGenerationAbortController(
  variantStrategyId: string,
  controller: AbortController,
): void {
  if (controllers.get(variantStrategyId) === controller) {
    controllers.delete(variantStrategyId);
  }
}

/** Stop the in-flight SSE / agent session for this hypothesis lane (same as browser closing the stream). */
export function abortGenerationForStrategy(variantStrategyId: string): void {
  const c = controllers.get(variantStrategyId);
  c?.abort();
  controllers.delete(variantStrategyId);
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return false;
}
