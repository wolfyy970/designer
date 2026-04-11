import { useEffect, useState } from 'react';
import type { LivenessSlice } from '../types/provider';
import {
  FILE_STALL_WARN_SEC,
  FIRST_FILE_WAIT_ELAPSED_SEC,
  FOOTER_TICK_MS,
  modelQuietSeconds,
  MODEL_REASONING_HUSH_SEC,
  STREAM_QUIET_WARN_SEC,
  THINKING_DISPLAY_THRESHOLD_SEC,
} from '../lib/generation-liveness';

export type GenerationStallHints = {
  fileStallSec: number;
  modelQuietSec: number | undefined;
  showStreamQuietWarning: boolean;
  showFileStall: boolean;
  firstFileWait: boolean;
  modelActivityDetail: string | null;
  thinkingSec: number;
  isActivelyThinking: boolean;
  isStreamingToolArgs: boolean;
};

/**
 * Pure stall / quiet-model hints for the generating footer (testable without React).
 */
export function computeGenerationStallHints(args: {
  now: number;
  liveness: LivenessSlice;
  written: number;
  total: number;
  hasPlan: boolean;
  elapsed: number;
}): GenerationStallHints {
  const { now, liveness, written, total, hasPlan, elapsed } = args;
  const {
    lastAgentFileAt,
    lastActivityAt,
    lastTraceAt,
    streamingToolName,
    agenticPhase,
    activeThinkingStartedAt,
  } = liveness;

  const isBuilding = !agenticPhase || agenticPhase === 'building';
  const isStreamingToolArgs = isBuilding && streamingToolName != null;
  const isActivelyThinking =
    isBuilding && activeThinkingStartedAt != null && activeThinkingStartedAt > 0;
  const thinkingSec = isActivelyThinking
    ? Math.max(0, Math.floor((now - activeThinkingStartedAt) / 1000))
    : 0;

  const fileStallSec =
    isBuilding && lastAgentFileAt != null && (!hasPlan || written < total)
      ? Math.max(0, Math.floor((now - lastAgentFileAt) / 1000))
      : 0;
  const modelQuietSec = modelQuietSeconds(now, lastActivityAt, lastTraceAt);
  const showStreamQuietWarning =
    isBuilding &&
    !isStreamingToolArgs &&
    !isActivelyThinking &&
    modelQuietSec != null &&
    modelQuietSec >= STREAM_QUIET_WARN_SEC;
  const showFileStall =
    !isStreamingToolArgs && !isActivelyThinking && fileStallSec >= FILE_STALL_WARN_SEC;
  const firstFileWait =
    !isStreamingToolArgs &&
    !isActivelyThinking &&
    isBuilding &&
    written === 0 &&
    lastAgentFileAt == null &&
    elapsed >= FIRST_FILE_WAIT_ELAPSED_SEC;

  const modelActivityDetail = (() => {
    if (!isBuilding || isStreamingToolArgs || modelQuietSec == null) return null;
    if (isActivelyThinking) {
      return thinkingSec > THINKING_DISPLAY_THRESHOLD_SEC
        ? `Model reasoning (${thinkingSec}s)…`
        : 'Model reasoning…';
    }
    if (modelQuietSec === 0) return 'Model activity updating';
    if (modelQuietSec < MODEL_REASONING_HUSH_SEC) return 'Model reasoning…';
    if (modelQuietSec < STREAM_QUIET_WARN_SEC) return `Last model activity ${modelQuietSec}s ago`;
    return null;
  })();

  return {
    fileStallSec,
    modelQuietSec,
    showStreamQuietWarning,
    showFileStall,
    firstFileWait,
    modelActivityDetail,
    thinkingSec,
    isActivelyThinking,
    isStreamingToolArgs,
  };
}

/**
 * Drives `now` on an interval and returns {@link computeGenerationStallHints} for footer UI.
 */
export function useGenerationStallHints(args: {
  liveness: LivenessSlice;
  written: number;
  total: number;
  hasPlan: boolean;
  elapsed: number;
}): GenerationStallHints {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), FOOTER_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return computeGenerationStallHints({ ...args, now });
}
