import { getProvider } from './providers/registry.ts';
import { getPromptBody } from '../db/prompts.ts';
import { extractCode, extractCodeStreaming } from '../lib/extract-code.ts';
import { loggedGenerateChatStream } from '../lib/llm-call-logger.ts';
import { normalizeError } from '../lib/error-utils.ts';
import { env } from '../env.ts';
import { isLangfuseTracingEnabled } from '../lib/langfuse-tracing-enabled.ts';
import { createTraceId, startActiveObservation } from '@langfuse/tracing';
import {
  runAgenticWithEvaluation,
  type AgenticOrchestratorEvent,
} from './agentic-orchestrator.ts';
import type { ChatMessage } from '../../src/types/provider.ts';
import type { GenerateStreamBody } from '../lib/generate-stream-schema.ts';

export interface SseStreamWriter {
  writeSSE: (opts: { data: string; event: string; id: string }) => void | Promise<void>;
}

export interface WriteGate {
  enqueue: (fn: () => Promise<void>) => Promise<void>;
}

export function createWriteGate(): WriteGate {
  let tail = Promise.resolve();
  return {
    enqueue(fn: () => Promise<void>): Promise<void> {
      const next = tail.then(fn);
      tail = next.catch(() => {});
      return next;
    },
  };
}

export type LaneEndMode = 'done' | 'lane_done';

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

  const wrap = (data: Record<string, unknown>): Record<string, unknown> =>
    laneIndex !== undefined ? { ...data, laneIndex } : data;

  const write = async (event: string, data: Record<string, unknown>) => {
    const payload = JSON.stringify(wrap(data));
    await gate.enqueue(async () => {
      await stream.writeSSE({ data: payload, event, id: allocId() });
    });
  };

  if (body.mode === 'agentic') {
    const writeAgentic = async (event: AgenticOrchestratorEvent) => {
      if (abortSignal.aborted) return;
      if (event.type === 'phase') {
        await write('phase', { phase: event.phase });
        return;
      }
      if (event.type === 'evaluation_progress') {
        await write('evaluation_progress', {
          round: event.round,
          phase: event.phase,
          message: event.message,
        });
        return;
      }
      if (event.type === 'evaluation_report') {
        await write('evaluation_report', { round: event.round, snapshot: event.snapshot });
        return;
      }
      if (event.type === 'revision_round') {
        await write('revision_round', { round: event.round, brief: event.brief });
        return;
      }
      if (event.type === 'skills_loaded') {
        await write('skills_loaded', { skills: event.skills });
        return;
      }
      if (event.type === 'trace') {
        await write('trace', { trace: event.trace });
        return;
      }
      if (event.type === 'thinking') {
        await write('thinking', { delta: event.payload, turnId: event.turnId });
        return;
      }
      if (event.type === 'activity') {
        await write('activity', { entry: event.payload });
      } else if (event.type === 'code') {
        await write('code', { code: event.payload });
      } else if (event.type === 'error') {
        await write('error', { error: event.payload });
      } else if (event.type === 'file') {
        await write('file', { path: event.path, content: event.content });
      } else if (event.type === 'plan') {
        await write('plan', { files: event.files });
      } else if (event.type === 'todos') {
        await write('todos', { todos: event.todos });
      } else {
        await write('progress', { status: event.payload });
      }
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
      getPromptBody,
      onStream: writeAgentic,
    });
    if (agenticResult?.checkpoint) {
      await write('checkpoint', { checkpoint: agenticResult.checkpoint });
    }
    if (laneEndMode === 'lane_done' && laneIndex !== undefined) {
      await write('lane_done', { laneIndex });
    } else {
      await write('done', {});
    }
    return;
  }

  const provider = getProvider(body.providerId);
  if (!provider) {
    await write('error', { error: `Unknown provider: ${body.providerId}` });
    return;
  }

  const runSingleShot = async () => {
    const systemPrompt = await getPromptBody('genSystemHtml');
    await write('progress', { status: 'Generating design…' });

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: body.prompt },
    ];

    const streamStart = Date.now();
    let lastChunkAt = streamStart;
    const stallHeartbeatMs = 12_000;
    const stallTimer = setInterval(() => {
      const totalSec = Math.floor((Date.now() - streamStart) / 1000);
      const idleSec = Math.floor((Date.now() - lastChunkAt) / 1000);
      const status =
        lastChunkAt === streamStart
          ? `Waiting for model… ${totalSec}s`
          : `Receiving response… idle ${idleSec}s · ${totalSec}s total`;
      void write('progress', { status });
    }, stallHeartbeatMs);

    let lastCodeEmitAt = 0;
    let lastEmittedPreviewLen = 0;
    const emitStreamCode = async (raw: string, force: boolean) => {
      const preview = extractCodeStreaming(raw);
      const now = Date.now();
      if (
        !force &&
        preview.length - lastEmittedPreviewLen < 160 &&
        now - lastCodeEmitAt < 100
      ) {
        return;
      }
      lastCodeEmitAt = now;
      lastEmittedPreviewLen = preview.length;
      await write('code', { code: preview });
    };

    try {
      const response = await loggedGenerateChatStream(
        provider,
        body.providerId,
        messages,
        {
          model: body.modelId,
          supportsVision: body.supportsVision,
          signal: abortSignal,
        },
        {
          source: 'builder',
          phase: 'Single-shot generate',
          ...(correlationId ? { correlationId } : {}),
          signal: abortSignal,
        },
        async (accumulated) => {
          lastChunkAt = Date.now();
          await emitStreamCode(accumulated, false);
        },
      );

      if (abortSignal.aborted) return;

      const code = extractCode(response.raw);
      await write('code', { code });
    } finally {
      clearInterval(stallTimer);
    }

    if (laneEndMode === 'lane_done' && laneIndex !== undefined) {
      await write('lane_done', { laneIndex });
    } else {
      await write('done', {});
    }
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
        event: 'error',
        id: options.allocId(),
      });
    });
    if (options.laneEndMode === 'lane_done' && options.laneIndex !== undefined) {
      await gate.enqueue(async () => {
        await stream.writeSSE({
          data: JSON.stringify({ laneIndex: options.laneIndex }),
          event: 'lane_done',
          id: options.allocId(),
        });
      });
    }
  }
}
