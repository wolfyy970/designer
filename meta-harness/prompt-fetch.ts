/**
 * Shared GET /api/prompts/:key for meta-harness (Langfuse-backed when configured).
 */

export type FetchPromptBodyResult = {
  body: string | null;
  /** Present when `body` is null (HTTP failure, empty payload, timeout, or network). */
  error?: string;
};

/**
 * @param timeoutMs When set and > 0 adds `AbortSignal.timeout`; timeout/abort map to `error: 'timeout'`.
 */
export async function fetchPromptBody(
  apiBaseUrl: string,
  key: string,
  timeoutMs?: number,
): Promise<FetchPromptBodyResult> {
  const base = apiBaseUrl.replace(/\/$/, '');
  const url = `${base}/prompts/${encodeURIComponent(key)}`;
  try {
    const init: RequestInit = {};
    if (timeoutMs != null && timeoutMs > 0) {
      init.signal = AbortSignal.timeout(timeoutMs);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      return {
        body: null,
        error: res.status === 404 ? 'key not found in live API' : `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as { body?: unknown };
    if (typeof data.body !== 'string' || data.body.length === 0) {
      return { body: null, error: 'empty body from API' };
    }
    return { body: data.body };
  } catch (e) {
    if (timeoutMs != null && timeoutMs > 0) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        return { body: null, error: 'timeout' };
      }
    }
    return { body: null, error: 'network error' };
  }
}
