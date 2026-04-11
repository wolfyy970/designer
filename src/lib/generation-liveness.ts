/** Show stream-quiet warning in build phase after this many seconds without model/trace signals. */
export const STREAM_QUIET_WARN_SEC = 120;

/** Warn when no new virtual file saved for this long while build expects more output. */
export const FILE_STALL_WARN_SEC = 40;

/** After this many seconds with zero files, show “first write may be slow” hint. */
export const FIRST_FILE_WAIT_ELAPSED_SEC = 50;

/** Below this many seconds since last model activity, show a soft “model reasoning…” hint (before stream-quiet warning). */
export const MODEL_REASONING_HUSH_SEC = 30;

/** Footer timer tick interval (stall hints, “thinking Ns”). */
export const FOOTER_TICK_MS = 1000;

/** Above this many seconds of visible thinking, show the duration in the activity line. */
export const THINKING_DISPLAY_THRESHOLD_SEC = 3;

/** Latest of two optional unix ms timestamps; undefined if neither set. */
export function lastDefinedMax(a?: number, b?: number): number | undefined {
  if (a == null) return b ?? undefined;
  if (b == null) return a;
  return Math.max(a, b);
}

/** Seconds since max(lastActivityAt, lastTraceAt), or undefined if both missing. */
export function modelQuietSeconds(
  nowMs: number,
  lastActivityAt?: number,
  lastTraceAt?: number,
): number | undefined {
  const last = lastDefinedMax(lastActivityAt, lastTraceAt);
  if (last == null) return undefined;
  return Math.max(0, Math.floor((nowMs - last) / 1000));
}
