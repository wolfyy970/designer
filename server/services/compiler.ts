import { z } from 'zod';
import type { DesignSpec, ReferenceImage } from '../../src/types/spec.ts';
import type { CompiledPrompt, IncubationPlan, HypothesisStrategy } from '../../src/types/compiler.ts';
import type { ChatMessage } from '../../src/types/provider.ts';
import {
  buildCompilerUserPrompt,
  type CompilerPromptOptions,
} from '../../src/lib/prompts/compiler-user.ts';
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
    compilerModel: model,
  };
}

export interface CompileOptions {
  systemPrompt: string;
  userPromptTemplate: string;
  referenceDesigns?: { name: string; code: string }[];
  supportsVision?: boolean;
  promptOptions?: CompilerPromptOptions;
}

/** Throttle compile stream previews (mirrors single-shot generate). */
const COMPILE_STREAM_PREVIEW_MIN_NEW_CHARS = 160;
const COMPILE_STREAM_PREVIEW_MIN_INTERVAL_MS = 100;
const COMPILE_STREAM_STALL_HEARTBEAT_MS = 12_000;

export type CompileSpecStreamHooks = {
  signal?: AbortSignal;
  correlationId?: string;
  /** Heartbeat while waiting for first token / idle (maps to SSE `progress`). */
  onProgressStatus?: (status: string) => void | Promise<void>;
  /** Throttled full raw model output so far (maps to SSE `code` previews). */
  onAccumulatedDelta?: (accumulated: string) => void | Promise<void>;
};

export async function compileSpec(
  spec: DesignSpec,
  model: string,
  providerId: string,
  options: CompileOptions,
): Promise<IncubationPlan> {
  const userPrompt = buildCompilerUserPrompt(
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
    { temperature: 0.7, images, completionPurpose: 'compile' },
    { source: 'compiler', phase: 'Compile spec → dimension map' },
  );

  const jsonStr = extractLlmJsonObjectSegment(chat);
  let raw: unknown;
  try {
    raw = parseJsonLenient(jsonStr);
  } catch {
    const reg = getProvider(providerId);
    logLlmCall({
      source: 'compiler',
      phase: 'Compile spec → dimension map',
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
      `Compiler returned invalid JSON. Try re-compiling or switching models.\n\nRaw response:\n${rawPreview}\n\nJSON segment attempted:\n${jsonProbe}`,
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
      `[compile] Received ${map.hypotheses.length} hypothesis(es) but ${asked} were requested — often output truncation or the model stopping early. max_tokens=${
        env.MAX_OUTPUT_TOKENS ?? 'omitted (provider / model default)'
      }`,
    );
  }
  return map;
}

/**
 * Streamed compile: same output as {@link compileSpec}, but forwards token deltas via `onAccumulatedDelta`.
 */
export async function compileSpecStream(
  spec: DesignSpec,
  model: string,
  providerId: string,
  options: CompileOptions,
  streamHooks: CompileSpecStreamHooks = {},
): Promise<IncubationPlan> {
  const { signal: abortSignal, correlationId, onProgressStatus, onAccumulatedDelta } = streamHooks;
  const userPrompt = buildCompilerUserPrompt(
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
        : `Receiving compiler output… idle ${idleSec}s · ${totalSec}s total`;
    void onProgressStatus?.(status);
  }, COMPILE_STREAM_STALL_HEARTBEAT_MS);

  let lastCodeEmitAt = 0;
  let lastEmittedPreviewLen = 0;
  const emitPreview = async (raw: string, force: boolean) => {
    const now = Date.now();
    if (
      !force &&
      raw.length - lastEmittedPreviewLen < COMPILE_STREAM_PREVIEW_MIN_NEW_CHARS &&
      now - lastCodeEmitAt < COMPILE_STREAM_PREVIEW_MIN_INTERVAL_MS
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
        completionPurpose: 'compile',
        signal: abortSignal,
        ...(images && images.length > 0 ? { supportsVision: true } : {}),
      },
      {
        source: 'compiler',
        phase: 'Compile spec → dimension map (stream)',
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
      throw new Error('Compile aborted');
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
      source: 'compiler',
      phase: 'Compile spec → dimension map (stream)',
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
      `Compiler returned invalid JSON. Try re-compiling or switching models.\n\nRaw response:\n${rawPreview}\n\nJSON segment attempted:\n${jsonProbe}`,
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
      `[compile] Received ${map.hypotheses.length} hypothesis(es) but ${asked} were requested — often output truncation or the model stopping early. max_tokens=${
        env.MAX_OUTPUT_TOKENS ?? 'omitted (provider / model default)'
      }`,
    );
  }
  return map;
}

export function compileHypothesisPrompts(
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
