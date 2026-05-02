/**
 * Fire-and-log async event emission used by the host's Pi event bridge and
 * direct emission sites. Wraps `onEvent(event)` so:
 *   • sync throws and async rejections are caught,
 *   • the failure is logged with a grep-stable prefix,
 *   • an optional `onFail` side-channel receives the raw error,
 *   • the caller never sees an unhandled promise rejection.
 *
 * Replaces the previous `pi-sdk/emit-event.ts` location.
 */
import { normalizeError } from '../../src/lib/error-utils.ts';

export interface EmitEventOptions {
  onFail?: (err: unknown) => void;
  /** Log prefix for grep/observability (e.g. `[bridge]`, `[pi-emit]`). */
  label?: string;
}

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
