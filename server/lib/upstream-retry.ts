/**
 * App-level retry for OpenRouter / upstream errors that the Pi SDK auto-retry regex does not match
 * (see pi-coding-agent AgentSession._isRetryableError).
 */

/** Matches transient-ish upstream failures worth one or more manual retries. */
export const APP_RETRYABLE_UPSTREAM_PATTERN = /upstream|5\d{2}|NaN|provider.*error|gateway/i;

export function isAppRetryableUpstreamError(message: string | undefined): boolean {
  if (!message?.trim()) return false;
  return APP_RETRYABLE_UPSTREAM_PATTERN.test(message);
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
