/**
 * POST /api/hypothesis/generate and collect SSE outcomes + eval-run directory.
 */
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { SSE_EVENT_NAMES } from '../src/constants/sse-events.ts';
import type { AggregatedEvaluationReport } from '../src/types/evaluation.ts';
import { readSseEventStream } from '../src/lib/sse-reader.ts';
import { parseSseJsonObject } from './sse-utils.ts';
import { ARTIFACT, EVAL_META_JSON_POLL_MS, EVAL_META_JSON_WAIT_MS } from './constants.ts';
import { mergeHttpTimeoutSignal } from './openrouter-client.ts';
import { EvalRunMetaSchema } from './schemas.ts';

type HypothesisEvalResult = {
  baseCorrelationId: string;
  laneCorrelationId: string;
  overallScore: number | null;
  stopReason: string | null;
  finalAggregate: AggregatedEvaluationReport | null;
  errorMessage?: string;
  evalRunDir: string | null;
  sseErrors: string[];
};

/** Poll for eval-run `meta.json`; `onWaiting` fires between attempts (elapsed seconds since wait start). */
export async function waitForMetaJson(
  evalRunRoot: string,
  timeoutMs: number,
  intervalMs: number,
  onWaiting?: (elapsedSec: number) => void,
): Promise<boolean> {
  const metaPath = path.join(evalRunRoot, ARTIFACT.metaJson);
  const deadline = Date.now() + timeoutMs;
  const waitStart = Date.now();
  while (Date.now() < deadline) {
    try {
      await access(metaPath);
      return true;
    } catch {
      onWaiting?.(Math.floor((Date.now() - waitStart) / 1000));
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return false;
}

export async function runHypothesisEvalFromMetaHarness(options: {
  apiBaseUrl: string;
  body: Record<string, unknown>;
  evalRunsBaseDir: string;
  signal?: AbortSignal;
  /** POST /hypothesis/generate full-read timeout (merged with `signal` when set). */
  hypothesisGenerateTimeoutMs?: number;
  /** Default 60s — waiting for eval-runs disk flush after SSE ends. */
  evalLogWaitMs?: number;
  onWireEvent?: (event: string, payload: unknown) => void;
  /** Fired between polls while waiting for eval-runs/.../meta.json. */
  onMetaJsonWait?: (elapsedSec: number) => void;
}): Promise<HypothesisEvalResult> {
  const sseErrors: string[] = [];
  const streamState = {
    finalAggregate: null as AggregatedEvaluationReport | null,
    stopReason: null as string | null,
  };
  let errorMessage: string | undefined;

  const baseCorrelationId =
    typeof options.body.correlationId === 'string' && options.body.correlationId.trim() !== ''
      ? options.body.correlationId.trim()
      : crypto.randomUUID();
  const laneCorrelationId = `${baseCorrelationId}:lane-0`;

  const url = `${options.apiBaseUrl.replace(/\/$/, '')}/hypothesis/generate`;
  const body = { ...options.body, correlationId: baseCorrelationId };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: mergeHttpTimeoutSignal(options.signal, options.hypothesisGenerateTimeoutMs),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      baseCorrelationId,
      laneCorrelationId,
      overallScore: null,
      stopReason: null,
      finalAggregate: null,
      errorMessage: `HTTP ${res.status}: ${text.slice(0, 500)}`,
      evalRunDir: null,
      sseErrors,
    };
  }

  const reader = res.body?.getReader();
  if (!reader) {
    return {
      baseCorrelationId,
      laneCorrelationId,
      overallScore: null,
      stopReason: null,
      finalAggregate: null,
      errorMessage: 'No response body',
      evalRunDir: null,
      sseErrors,
    };
  }

  await readSseEventStream(reader, async (eventName, dataLine) => {
    const ev = eventName.trim();
    if (ev === SSE_EVENT_NAMES.error) {
      const obj = parseSseJsonObject(dataLine);
      const err =
        obj && typeof obj.error === 'string'
          ? obj.error
          : typeof dataLine === 'string'
            ? dataLine
            : 'error';
      errorMessage = err;
      sseErrors.push(err);
    }

    if (ev === SSE_EVENT_NAMES.done || ev === SSE_EVENT_NAMES.lane_done) {
      options.onWireEvent?.(ev, parseSseJsonObject(dataLine) ?? dataLine);
      return;
    }

    const parsed: Record<string, unknown> | null = parseSseJsonObject(dataLine);
    if (!parsed) {
      return;
    }

    const laneIndex = parsed.laneIndex;
    const strip =
      typeof laneIndex === 'number'
        ? Object.fromEntries(Object.entries(parsed).filter(([k]) => k !== 'laneIndex'))
        : parsed;

    options.onWireEvent?.(ev, strip);

    if (ev === SSE_EVENT_NAMES.evaluation_report) {
      const snapshot = strip.snapshot as { aggregate?: AggregatedEvaluationReport } | undefined;
      if (snapshot?.aggregate) {
        streamState.finalAggregate = snapshot.aggregate;
      }
    }

    if (ev === SSE_EVENT_NAMES.checkpoint) {
      const sr = strip.stopReason;
      if (typeof sr === 'string') streamState.stopReason = sr;
      const agg = strip.aggregate as AggregatedEvaluationReport | undefined;
      if (agg && typeof agg.overallScore === 'number') {
        streamState.finalAggregate = agg;
      }
    }
  });

  const evalRunDir = path.join(options.evalRunsBaseDir, 'eval-runs', laneCorrelationId);
  const waitMs = options.evalLogWaitMs ?? EVAL_META_JSON_WAIT_MS;
  const ok = await waitForMetaJson(evalRunDir, waitMs, EVAL_META_JSON_POLL_MS, options.onMetaJsonWait);

  let diskScore: number | null = null;
  let diskStop: string | null = null;
  if (ok) {
    try {
      const raw = await readFile(path.join(evalRunDir, ARTIFACT.metaJson), 'utf8');
      const parsedMeta = EvalRunMetaSchema.safeParse(JSON.parse(raw) as unknown);
      if (parsedMeta.success) {
        if (typeof parsedMeta.data.finalOverallScore === 'number')
          diskScore = parsedMeta.data.finalOverallScore;
        if (typeof parsedMeta.data.stopReason === 'string') diskStop = parsedMeta.data.stopReason;
      }
    } catch {
      /* ignore */
    }
  }

  const fa = streamState.finalAggregate;
  let overallScore: number | null = null;
  if (fa != null && typeof fa.overallScore === 'number') {
    overallScore = fa.overallScore;
  } else if (typeof diskScore === 'number') {
    overallScore = diskScore;
  }

  let stopReason = streamState.stopReason;
  if (stopReason == null && diskStop != null) stopReason = diskStop;

  return {
    baseCorrelationId,
    laneCorrelationId,
    overallScore,
    stopReason,
    finalAggregate: fa,
    errorMessage,
    evalRunDir: ok ? evalRunDir : null,
    sseErrors,
  };
}
