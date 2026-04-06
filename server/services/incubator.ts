import { z } from 'zod';
import type { DesignSpec, ReferenceImage } from '../../src/types/spec.ts';
import type { CompiledPrompt, IncubationPlan, HypothesisStrategy } from '../../src/types/incubator.ts';
import type { ChatMessage } from '../../src/types/provider.ts';
import {
  buildIncubatorUserPrompt,
  type IncubatorPromptOptions,
} from '../../src/lib/prompts/incubator-user.ts';
import { buildHypothesisPrompt } from '../../src/lib/prompts/hypothesis-prompt.ts';
import { generateId, now } from '../../src/lib/utils.ts';
import { env } from '../env.ts';
import { logLlmCall } from '../log-store.ts';
import { loggedCallLLM, loggedGenerateChatStream } from '../lib/llm-call-logger.ts';
import { mergeReferenceImagesIntoMessages } from '../lib/merge-reference-images-into-messages.ts';
import { getProvider } from './providers/registry.ts';
import { parseJsonLenient } from '../lib/parse-json-lenient.ts';
import { extractLlmJsonObjectSegment } from '../lib/extract-llm-json.ts';
export type { ChatMessage };

const DimensionSchema = z.object({
  name: z.string().default(''),
  range: z.string().default(''),
  isConstant: z.boolean().default(false),
});

const HypothesisStrategySchema = z.object({
  name: z.string().default('Unnamed Hypothesis'),
  hypothesis: z.string().optional().default(''),
  primaryEmphasis: z.string().optional(),
  rationale: z.string().default(''),
  measurements: z.string().default(''),
  dimensionValues: z.record(z.string(), z.unknown()).optional().default(() => ({})),
}).transform((v) => ({
  id: generateId(),
  name: v.name,
  hypothesis: v.hypothesis || v.primaryEmphasis || '',
  rationale: v.rationale,
  measurements: v.measurements,
  dimensionValues: Object.fromEntries(
    Object.entries(v.dimensionValues ?? {}).map(([k, val]) => [k, String(val)])
  ),
}));

const LLMResponseSchema = z.object({
  dimensions: z.array(z.unknown()).default([]).transform((arr) =>
    arr.map((d) => DimensionSchema.parse(typeof d === 'object' && d !== null ? d : {}))
  ),
  hypotheses: z.array(z.unknown()).optional(),
  variants: z.array(z.unknown()).optional(),
}).transform((obj) => ({
  dimensions: obj.dimensions,
  hypotheses: (obj.hypotheses ?? obj.variants ?? []).map(
    (v) => HypothesisStrategySchema.parse(typeof v === 'object' && v !== null ? v : {})
  ),
}));

function parseIncubationPlan(raw: unknown, specId: string, model: string): IncubationPlan {
  const { dimensions, hypotheses } = LLMResponseSchema.parse(
    typeof raw === 'object' && raw !== null ? raw : {}
  );
  return {
    id: generateId(),
    specId,
    dimensions,
    hypotheses,
    generatedAt: now(),
    incubatorModel: model,
  };
}

export interface IncubateOptions {
  systemPrompt: string;
  userPromptTemplate: string;
  referenceDesigns?: { name: string; code: string }[];
  supportsVision?: boolean;
  promptOptions?: IncubatorPromptOptions;
}

/** Throttle compile stream previews (mirrors generate SSE pacing). */
const INCUBATE_STREAM_PREVIEW_MIN_NEW_CHARS = 160;
const INCUBATE_STREAM_PREVIEW_MIN_INTERVAL_MS = 100;
const INCUBATE_STREAM_STALL_HEARTBEAT_MS = 12_000;

export type IncubateSpecStreamHooks = {
  signal?: AbortSignal;
  correlationId?: string;
  /** Heartbeat while waiting for first token / idle (maps to SSE `progress`). */
  onProgressStatus?: (status: string) => void | Promise<void>;
  /** Throttled full raw model output so far (maps to SSE `code` previews). */
  onAccumulatedDelta?: (accumulated: string) => void | Promise<void>;
};

export async function incubateSpec(
  spec: DesignSpec,
  model: string,
  providerId: string,
  options: IncubateOptions,
): Promise<IncubationPlan> {
  const userPrompt = buildIncubatorUserPrompt(
    spec,
    options.userPromptTemplate,
    options.referenceDesigns,
    options.promptOptions,
  );

  const images = options.supportsVision
    ? Object.values(spec.sections).flatMap((s) => s.images).filter((img) => img.dataUrl)
    : undefined;

  const systemPrompt = options.systemPrompt;
  const chat = await loggedCallLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    model,
    providerId,
    { temperature: 0.7, images, completionPurpose: 'incubate' },
    { source: 'incubator', phase: 'Incubate spec → dimension map' },
  );

  const jsonStr = extractLlmJsonObjectSegment(chat);
  let raw: unknown;
  try {
    raw = parseJsonLenient(jsonStr);
  } catch {
    const reg = getProvider(providerId);
    logLlmCall({
      source: 'incubator',
      phase: 'Incubate spec → dimension map',
      model,
      provider: providerId,
      ...(reg?.name && reg.name !== providerId ? { providerName: reg.name } : {}),
      systemPrompt,
      userPrompt,
      response: chat,
      durationMs: 0,
      error: 'Invalid JSON response',
    });
    const rawPreview =
      chat.trim() === ''
        ? '(empty — provider may use array message.content; see extractMessageText / LLM log)'
        : chat.slice(0, 4000);
    const jsonProbe =
      jsonStr.trim() === ''
        ? '(extractLlmJsonObjectSegment found no fenced or braced JSON)'
        : jsonStr.length > 800
          ? `${jsonStr.slice(0, 800)}…`
          : jsonStr;
    throw new Error(
      `incubator returned invalid JSON. Try re-incubating or switching models.\n\nRaw response:\n${rawPreview}\n\nJSON segment attempted:\n${jsonProbe}`,
    );
  }

  const map = parseIncubationPlan(raw, spec.id, model);
  const asked = options.promptOptions?.count;
  if (
    asked != null &&
    map.hypotheses.length < asked &&
    process.env.NODE_ENV !== 'production'
  ) {
    console.warn(
      `[incubate] Received ${map.hypotheses.length} hypothesis(es) but ${asked} were requested — often output truncation or the model stopping early. max_tokens=${
        env.MAX_OUTPUT_TOKENS ?? 'omitted (provider / model default)'
      }`,
    );
  }
  return map;
}

/**
 * Streamed compile: same output as {@link incubateSpec}, but forwards token deltas via `onAccumulatedDelta`.
 */
export async function incubateSpecStream(
  spec: DesignSpec,
  model: string,
  providerId: string,
  options: IncubateOptions,
  streamHooks: IncubateSpecStreamHooks = {},
): Promise<IncubationPlan> {
  const { signal: abortSignal, correlationId, onProgressStatus, onAccumulatedDelta } = streamHooks;
  const userPrompt = buildIncubatorUserPrompt(
    spec,
    options.userPromptTemplate,
    options.referenceDesigns,
    options.promptOptions,
  );

  const images = options.supportsVision
    ? Object.values(spec.sections).flatMap((s) => s.images).filter((img) => img.dataUrl)
    : undefined;

  const systemPrompt = options.systemPrompt;
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const finalMessages = mergeReferenceImagesIntoMessages(messages, images);

  const streamStart = Date.now();
  let lastChunkAt = streamStart;
  const stallTimer = setInterval(() => {
    const totalSec = Math.floor((Date.now() - streamStart) / 1000);
    const idleSec = Math.floor((Date.now() - lastChunkAt) / 1000);
    const status =
      lastChunkAt === streamStart
        ? `Waiting for model… ${totalSec}s`
        : `Receiving incubator output… idle ${idleSec}s · ${totalSec}s total`;
    void onProgressStatus?.(status);
  }, INCUBATE_STREAM_STALL_HEARTBEAT_MS);

  let lastCodeEmitAt = 0;
  let lastEmittedPreviewLen = 0;
  const emitPreview = async (raw: string, force: boolean) => {
    const now = Date.now();
    if (
      !force &&
      raw.length - lastEmittedPreviewLen < INCUBATE_STREAM_PREVIEW_MIN_NEW_CHARS &&
      now - lastCodeEmitAt < INCUBATE_STREAM_PREVIEW_MIN_INTERVAL_MS
    ) {
      return;
    }
    lastCodeEmitAt = now;
    lastEmittedPreviewLen = raw.length;
    await onAccumulatedDelta?.(raw);
  };

  let chat: string;
  try {
    const response = await loggedGenerateChatStream(
      provider,
      providerId,
      finalMessages,
      {
        model,
        completionPurpose: 'incubate',
        signal: abortSignal,
        ...(images && images.length > 0 ? { supportsVision: true } : {}),
      },
      {
        source: 'incubator',
        phase: 'Incubate spec → dimension map (stream)',
        ...(correlationId ? { correlationId } : {}),
        signal: abortSignal,
      },
      async (accumulated) => {
        lastChunkAt = Date.now();
        await emitPreview(accumulated, false);
      },
    );
    chat = response.raw;
    if (abortSignal?.aborted) {
      throw new Error('Incubate aborted');
    }
    await emitPreview(chat, true);
  } finally {
    clearInterval(stallTimer);
  }

  const jsonStr = extractLlmJsonObjectSegment(chat);
  let raw: unknown;
  try {
    raw = parseJsonLenient(jsonStr);
  } catch {
    const reg = getProvider(providerId);
    logLlmCall({
      source: 'incubator',
      phase: 'Incubate spec → dimension map (stream)',
      model,
      provider: providerId,
      ...(reg?.name && reg.name !== providerId ? { providerName: reg.name } : {}),
      systemPrompt,
      userPrompt,
      response: chat,
      durationMs: 0,
      error: 'Invalid JSON response',
    });
    const rawPreview =
      chat.trim() === ''
        ? '(empty — provider may use array message.content; see extractMessageText / LLM log)'
        : chat.slice(0, 4000);
    const jsonProbe =
      jsonStr.trim() === ''
        ? '(extractLlmJsonObjectSegment found no fenced or braced JSON)'
        : jsonStr.length > 800
          ? `${jsonStr.slice(0, 800)}…`
          : jsonStr;
    throw new Error(
      `incubator returned invalid JSON. Try re-incubating or switching models.\n\nRaw response:\n${rawPreview}\n\nJSON segment attempted:\n${jsonProbe}`,
    );
  }

  const map = parseIncubationPlan(raw, spec.id, model);
  const asked = options.promptOptions?.count;
  if (
    asked != null &&
    map.hypotheses.length < asked &&
    process.env.NODE_ENV !== 'production'
  ) {
    console.warn(
      `[incubate] Received ${map.hypotheses.length} hypothesis(es) but ${asked} were requested — often output truncation or the model stopping early. max_tokens=${
        env.MAX_OUTPUT_TOKENS ?? 'omitted (provider / model default)'
      }`,
    );
  }
  return map;
}

export function incubateHypothesisPrompts(
  spec: DesignSpec,
  incubationPlan: IncubationPlan,
  hypothesisTemplate: string,
  designSystemOverride?: string,
  extraImages?: ReferenceImage[],
): CompiledPrompt[] {
  const allImages = [
    ...Object.values(spec.sections).flatMap((s) => s.images),
    ...(extraImages ?? []),
  ];

  return incubationPlan.hypotheses.map((strategy: HypothesisStrategy) => ({
    id: generateId(),
    strategyId: strategy.id,
    specId: spec.id,
    prompt: buildHypothesisPrompt(spec, strategy, hypothesisTemplate, designSystemOverride),
    images: allImages,
    compiledAt: now(),
  }));
}
