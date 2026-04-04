import { getPromptBody } from '../db/prompts.ts';
import type { PromptKey } from '../lib/prompts/defaults.ts';
import { extractCode, extractCodeStreaming } from '../../src/lib/extract-code.ts';
import { loggedGenerateChatStream } from '../lib/llm-call-logger.ts';
import type { ChatMessage } from '../../src/types/provider.ts';
import type { GenerationProvider } from '../../src/types/provider.ts';
import { SSE_EVENT_NAMES } from '../../src/constants/sse-events.ts';

/** Progress heartbeat while waiting for first token / idle chunks during single-shot stream */
const SINGLE_SHOT_STALL_HEARTBEAT_MS = 12_000;
/** Coalesce streaming code previews: min new chars and min interval */
const SINGLE_SHOT_CODE_PREVIEW_MIN_NEW_CHARS = 160;
const SINGLE_SHOT_CODE_PREVIEW_MIN_INTERVAL_MS = 100;

type SseWriteFn = (event: string, data: Record<string, unknown>) => Promise<void>;

/**
 * Single-shot HTML generation: progress heartbeats + streaming code previews + final extract.
 * Caller supplies `write` (typically lane-wrapped SSE).
 */
export async function executeSingleShotGenerateStream(options: {
  write: SseWriteFn;
  provider: GenerationProvider;
  prompt: string;
  providerId: string;
  modelId: string;
  supportsVision?: boolean;
  abortSignal: AbortSignal;
  correlationId?: string;
  laneIndex?: number;
  laneEndMode: 'done' | 'lane_done';
  resolvePromptBody?: (key: PromptKey) => Promise<string>;
}): Promise<void> {
  const {
    write,
    provider,
    prompt,
    providerId,
    modelId,
    supportsVision,
    abortSignal,
    correlationId,
    laneIndex,
    laneEndMode,
    resolvePromptBody,
  } = options;

  const resolve = resolvePromptBody ?? getPromptBody;
  const systemPrompt = await resolve('designer-direct-system');
  await write(SSE_EVENT_NAMES.progress, { status: 'Generating design…' });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ];

  const streamStart = Date.now();
  let lastChunkAt = streamStart;
  const stallHeartbeatMs = SINGLE_SHOT_STALL_HEARTBEAT_MS;
  const stallTimer = setInterval(() => {
    const totalSec = Math.floor((Date.now() - streamStart) / 1000);
    const idleSec = Math.floor((Date.now() - lastChunkAt) / 1000);
    const status =
      lastChunkAt === streamStart
        ? `Waiting for model… ${totalSec}s`
        : `Receiving response… idle ${idleSec}s · ${totalSec}s total`;
    void write(SSE_EVENT_NAMES.progress, { status }).catch(() => {
      /* best-effort heartbeat; broken SSE client should not cause unhandled rejection */
    });
  }, stallHeartbeatMs);

  let lastCodeEmitAt = 0;
  let lastEmittedPreviewLen = 0;
  const emitStreamCode = async (raw: string, force: boolean) => {
    const preview = extractCodeStreaming(raw);
    const now = Date.now();
    if (
      !force &&
      preview.length - lastEmittedPreviewLen < SINGLE_SHOT_CODE_PREVIEW_MIN_NEW_CHARS &&
      now - lastCodeEmitAt < SINGLE_SHOT_CODE_PREVIEW_MIN_INTERVAL_MS
    ) {
      return;
    }
    lastCodeEmitAt = now;
    lastEmittedPreviewLen = preview.length;
    await write(SSE_EVENT_NAMES.code, { code: preview });
  };

  try {
    const response = await loggedGenerateChatStream(
      provider,
      providerId,
      messages,
      {
        model: modelId,
        supportsVision,
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
    await write(SSE_EVENT_NAMES.code, { code });
  } finally {
    clearInterval(stallTimer);
  }

  if (laneEndMode === 'lane_done' && laneIndex !== undefined) {
    await write(SSE_EVENT_NAMES.lane_done, { laneIndex });
  } else {
    await write(SSE_EVENT_NAMES.done, {});
  }
}
