import { normalizeError } from '../lib/error-utils';
import { GENERATION_STATUS } from '../constants/generation';
import type { CompiledPrompt } from '../types/compiler';
import type { GenerationResult } from '../types/provider';
import type { ProvenanceContext } from '../types/provenance-context';
import { createPlaceholderTraceForwarder } from './placeholder-trace-forward';
import { createInitialPlaceholderSessionState } from './placeholder-session-state';
import { createPlaceholderStreamCallbacks } from './placeholder-stream-handlers';
import { createPlaceholderFinalizeAfterStream } from './placeholder-finalize';
import type { GenerateStreamCallbacks } from '../api/client';

const DEFAULT_TRACE_LIMIT = 120;

export interface PlaceholderSessionOptions {
  placeholderId: string;
  prompt: CompiledPrompt;
  providerId: string;
  model: string;
  mode?: 'single' | 'agentic';
  provenanceCtx?: ProvenanceContext;
  updateResult: (id: string, patch: Partial<GenerationResult>) => void;
  traceLimit?: number;
  onResultComplete?: (placeholderId: string) => void;
  /** Ties forwarded run-trace rows to the generate / hypothesis stream */
  correlationId?: string;
}

/**
 * SSE callbacks + post-stream persistence for one generation placeholder (single lane).
 */
export function createPlaceholderGenerationSession(
  options: PlaceholderSessionOptions,
): {
  callbacks: GenerateStreamCallbacks;
  finalizeAfterStream: () => Promise<void>;
} {
  const {
    placeholderId,
    prompt,
    providerId,
    model,
    mode,
    provenanceCtx,
    updateResult,
    traceLimit = DEFAULT_TRACE_LIMIT,
    onResultComplete,
    correlationId: sessionCorrelationId,
  } = options;

  const state = createInitialPlaceholderSessionState();
  const trace = createPlaceholderTraceForwarder({
    resultId: placeholderId,
    correlationId: sessionCorrelationId,
  });

  const callbacks = createPlaceholderStreamCallbacks({
    placeholderId,
    traceLimit,
    updateResult,
    scheduleTraceServerForward: trace.scheduleTraceServerForward,
    state,
  });

  const finalizeAfterStream = createPlaceholderFinalizeAfterStream({
    placeholderId,
    prompt,
    providerId,
    model,
    mode,
    provenanceCtx,
    updateResult,
    flushAllPendingTraces: trace.flushAllPending,
    state,
    onResultComplete,
  });

  return { callbacks, finalizeAfterStream };
}

export async function runFinalizeWithCatch(
  finalizeAfterStream: () => Promise<void>,
  placeholderId: string,
  updateResult: (id: string, patch: Partial<GenerationResult>) => void,
): Promise<void> {
  try {
    await finalizeAfterStream();
  } catch (err) {
    updateResult(placeholderId, {
      status: GENERATION_STATUS.ERROR,
      error: normalizeError(err, 'Generation failed'),
    });
  }
}
