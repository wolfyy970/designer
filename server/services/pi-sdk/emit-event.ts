import { normalizeError } from '../../../src/lib/error-utils.ts';

export interface EmitEventOptions {
  /** Side-channel receiver for the raw error (e.g. SSE delivery failure → agent abort). */
  onFail?: (err: unknown) => void;
  /**
   * Log prefix for grep/observability. AGENTS.md documents `[bridge]` for bridge emissions
   * and `[pi-emit]` for direct pi-agent-service emissions; callers keep their prefix stable.
   */
  label?: string;
}

/**
 * Fire-and-log async event emission. Wraps `onEvent(event)` so that:
 *   • sync throws and async rejections are caught,
 *   • the failure is logged with a grep-stable prefix,
 *   • an optional `onFail` side-channel receives the raw error,
 *   • the caller never sees an unhandled promise rejection.
 *
 * Use this instead of `void onEvent(...)` at every Pi-boundary emission site.
 * `safeBridgeEmit` in [pi-bridge-core.ts](../pi-bridge-core.ts) delegates here with `label: '[bridge]'`.
 */
export function emitEvent<E>(
  onEvent: (event: E) => void | Promise<void>,
  event: E,
  optionsOrOnFail?: EmitEventOptions | ((err: unknown) => void),
): void {
  const opts: EmitEventOptions =
    typeof optionsOrOnFail === 'function'
      ? { onFail: optionsOrOnFail }
      : optionsOrOnFail ?? {};
  const label = opts.label ?? '[pi-emit]';
  const handle = (e: unknown) => {
    console.error(`${label} onEvent failed`, normalizeError(e), e);
    opts.onFail?.(e);
  };
  try {
    const ret = onEvent(event);
    if (ret && typeof (ret as Promise<void>).then === 'function') {
      (ret as Promise<void>).catch(handle);
    }
  } catch (e) {
    handle(e);
  }
}
