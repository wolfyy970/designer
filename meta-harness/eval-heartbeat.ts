/**
 * Heartbeat + timeout helpers shared by meta-harness test evaluation paths.
 */
import type { MetaHarnessConfig } from './config.ts';
import type { RunnerCallbacks } from './runner-types.ts';
import {
  DEFAULT_HYPOTHESIS_RUBRIC_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
} from './constants.ts';

/** AbortSignal for OpenRouter hypothesis-rubric fetch; undefined when timeout disabled (cfg explicitly 0). */
export function hypothesisRubricAbortSignal(cfg: MetaHarnessConfig): AbortSignal | undefined {
  const raw = cfg.hypothesisRubricTimeoutMs;
  if (raw === 0) return undefined;
  const ms = typeof raw === 'number' && raw > 0 ? raw : DEFAULT_HYPOTHESIS_RUBRIC_TIMEOUT_MS;
  return AbortSignal.timeout(ms);
}

export type TestCaseHeartbeatOptions = {
  /** When `callbacks.shouldStop()` becomes true, abort in-flight HTTP (same controller as fetch `signal`). */
  linkUserStop?: AbortController;
};

export async function withTestCaseHeartbeat<T>(
  testName: string,
  callbacks: RunnerCallbacks,
  run: () => Promise<T>,
  options?: TestCaseHeartbeatOptions,
): Promise<T> {
  const wantInterval = Boolean(callbacks.onTestCaseHeartbeat || options?.linkUserStop);
  if (!wantInterval) {
    return run();
  }
  const t0 = Date.now();
  const id = setInterval(() => {
    if (options?.linkUserStop && callbacks.shouldStop?.()) {
      options.linkUserStop.abort();
    }
    callbacks.onTestCaseHeartbeat?.(testName, Math.floor((Date.now() - t0) / 1000));
  }, HEARTBEAT_INTERVAL_MS);
  try {
    return await run();
  } finally {
    clearInterval(id);
  }
}
