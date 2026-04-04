import { getProvider } from './providers/registry.ts';
import { normalizeError } from '../../src/lib/error-utils.ts';
import { env } from '../env.ts';
import { isLangfuseTracingEnabled } from '../lib/langfuse-tracing-enabled.ts';
import { createTraceId, startActiveObservation } from '@langfuse/tracing';
import { runAgenticWithEvaluation } from './agentic-orchestrator.ts';
import type { GenerateStreamBody } from '../lib/generate-stream-schema.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';
import { agenticOrchestratorEventToSse } from '../lib/agentic-sse-map.ts';
import { createResolvePromptBody, sanitizePromptOverrides } from '../lib/prompt-overrides.ts';
import { createWriteGate, type WriteGate } from '../lib/sse-write-gate.ts';
import { executeSingleShotGenerateStream } from './single-shot-generate-stream.ts';

export { createWriteGate };

export interface SseStreamWriter {
  writeSSE: (opts: { data: string; event: string; id: string }) => void | Promise<void>;
}

type LaneEndMode = 'done' | 'lane_done';

const GENERATE_ROOT_SPAN_ID = '0000000000000002';

/**
 * Runs single-shot or agentic generation and writes SSE events.
 * When `laneIndex` is set, every payload includes `laneIndex` for client demux.
 * `laneEndMode: 'lane_done'` emits `lane_done` instead of a final `done` (orchestrator sends global `done`).
 */
async function executeGenerateStream(
  stream: SseStreamWriter,
  body: GenerateStreamBody,
  abortSignal: AbortSignal,
  options: {
    allocId: () => string;
    laneIndex?: number;
    laneEndMode?: LaneEndMode;
    writeGate?: WriteGate;
    /** Server- or client-issued; ties LLM log rows to this stream */
    correlationId?: string;
  },
): Promise<void> {
  const { allocId, laneIndex, laneEndMode = 'done', writeGate, correlationId } = options;
  const gate = writeGate ?? { enqueue: (fn) => fn() };
  const resolvePrompt = createResolvePromptBody(sanitizePromptOverrides(body.promptOverrides));

  const wrap = (data: Record<string, unknown>): Record<string, unknown> =>
    laneIndex !== undefined ? { ...data, laneIndex } : data;

  const sseWriteAudit =
    env.isDev && body.mode === 'agentic'
      ? { byType: {} as Record<string, number>, skippedAbort: 0, t0: Date.now() }
      : null;

  const write = async (event: string, data: Record<string, unknown>) => {
    if (sseWriteAudit) sseWriteAudit.byType[event] = (sseWriteAudit.byType[event] ?? 0) + 1;
    const payload = JSON.stringify(wrap(data));
    await gate.enqueue(async () => {
      await stream.writeSSE({ data: payload, event, id: allocId() });
    });
  };

  if (body.mode === 'agentic') {
    const writeAgentic = async (event: Parameters<typeof agenticOrchestratorEventToSse>[0]) => {
      if (abortSignal.aborted) {
        if (sseWriteAudit) sseWriteAudit.skippedAbort += 1;
        return;
      }
      const { sseEvent, data } = agenticOrchestratorEventToSse(event);
      await write(sseEvent, data);
    };

    const agenticResult = await runAgenticWithEvaluation({
      build: {
        userPrompt: body.prompt,
        providerId: body.providerId,
        modelId: body.modelId,
        thinkingLevel: body.thinkingLevel,
        signal: abortSignal,
        ...(correlationId ? { correlationId } : {}),
      },
      compiledPrompt: body.prompt,
      evaluationContext: body.evaluationContext,
      evaluatorProviderId: body.evaluatorProviderId,
      evaluatorModelId: body.evaluatorModelId,
      maxRevisionRounds: body.agenticMaxRevisionRounds ?? env.AGENTIC_MAX_REVISION_ROUNDS,
      minOverallScore: body.agenticMinOverallScore ?? env.AGENTIC_MIN_OVERALL_SCORE,
      getPromptBody: resolvePrompt,
      onStream: writeAgentic,
    });
    if (agenticResult?.checkpoint) {
      await write(SSE_EVENT_NAMES.checkpoint, { checkpoint: agenticResult.checkpoint });
    }
    if (laneEndMode === 'lane_done' && laneIndex !== undefined) {
      await write(SSE_EVENT_NAMES.lane_done, { laneIndex });
    } else {
      await write(SSE_EVENT_NAMES.done, {});
    }
    if (sseWriteAudit) {
      console.debug('[generate:SSE] agentic write summary', {
        byType: sseWriteAudit.byType,
        skippedAbort: sseWriteAudit.skippedAbort,
        durationMs: Date.now() - sseWriteAudit.t0,
      });
    }
    return;
  }

  const provider = getProvider(body.providerId);
  if (!provider) {
    await write(SSE_EVENT_NAMES.error, { error: `Unknown provider: ${body.providerId}` });
    return;
  }

  const runSingleShot = async () => {
    await executeSingleShotGenerateStream({
      write,
      provider,
      prompt: body.prompt,
      providerId: body.providerId,
      modelId: body.modelId,
      supportsVision: body.supportsVision,
      abortSignal,
      correlationId,
      laneIndex,
      laneEndMode,
      resolvePromptBody: resolvePrompt,
    });
  };

  if (!isLangfuseTracingEnabled() || !correlationId) {
    await runSingleShot();
    return;
  }

  const parentSpanContext = {
    traceId: await createTraceId(correlationId),
    spanId: GENERATE_ROOT_SPAN_ID,
    traceFlags: 1,
  };
  await startActiveObservation(
    'generate-single',
    async (span) => {
      span.update({
        metadata: { correlationId, providerId: body.providerId, modelId: body.modelId },
        input: { mode: 'single', promptPreview: body.prompt.slice(0, 400) },
      });
      await runSingleShot();
      span.update({ output: { done: true } });
    },
    { parentSpanContext },
  );
}

export async function executeGenerateStreamSafe(
  stream: SseStreamWriter,
  body: GenerateStreamBody,
  abortSignal: AbortSignal,
  options: {
    allocId: () => string;
    laneIndex?: number;
    laneEndMode?: LaneEndMode;
    writeGate?: WriteGate;
    correlationId?: string;
  },
): Promise<void> {
  try {
    await executeGenerateStream(stream, body, abortSignal, options);
  } catch (err) {
    const gate = options.writeGate ?? { enqueue: (fn) => fn() };
    const payload = JSON.stringify(
      options.laneIndex !== undefined
        ? { error: normalizeError(err), laneIndex: options.laneIndex }
        : { error: normalizeError(err) },
    );
    await gate.enqueue(async () => {
      await stream.writeSSE({
        data: payload,
        event: SSE_EVENT_NAMES.error,
        id: options.allocId(),
      });
    });
    if (options.laneEndMode === 'lane_done' && options.laneIndex !== undefined) {
      await gate.enqueue(async () => {
        await stream.writeSSE({
          data: JSON.stringify({ laneIndex: options.laneIndex }),
          event: SSE_EVENT_NAMES.lane_done,
          id: options.allocId(),
        });
      });
    }
  }
}
