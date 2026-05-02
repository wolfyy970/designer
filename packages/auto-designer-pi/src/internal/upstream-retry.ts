/**
 * App-level retry classifier for upstream errors that Pi's auto-retry regex doesn't match
 * (gateway, 5xx, NaN, "provider error", etc.). Insufficient-credits-style failures are NOT
 * retryable — they're terminal until the user adds credit.
 */

export const APP_RETRYABLE_UPSTREAM_PATTERN = /upstream|5\d{2}|NaN|provider.*error|gateway/i;

export function isAppRetryableUpstreamError(message: string | undefined): boolean {
  if (!message?.trim()) return false;
  if (/insufficient credits|out of credits|credits are exhausted|402/i.test(message)) return false;
  return APP_RETRYABLE_UPSTREAM_PATTERN.test(message);
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
