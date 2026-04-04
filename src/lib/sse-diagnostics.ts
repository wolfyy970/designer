/**
 * Dev-only helpers to trace hypothesis generate SSE delivery (counts, drops).
 * Production: callers use `createSseStreamDiagnostics()` which returns a no-op stub.
 */

interface SseStreamDiagnosticsSnapshot {
  durationMs: number;
  byEvent: Record<string, number>;
  drops: number;
  dropReasons: { reason: string; detail?: string }[];
}

export interface SseStreamDiagnostics {
  recordReceived(eventName: string): void;
  recordDrop(reason: string, detail?: string): void;
  summary(): SseStreamDiagnosticsSnapshot;
  logClose(): void;
}

class SseStreamDiagnosticsImpl implements SseStreamDiagnostics {
  private readonly startedAt = Date.now();
  private readonly counts = new Map<string, number>();
  private readonly dropList: { reason: string; detail?: string }[] = [];

  recordReceived(eventName: string): void {
    this.counts.set(eventName, (this.counts.get(eventName) ?? 0) + 1);
  }

  recordDrop(reason: string, detail?: string): void {
    this.dropList.push({ reason, detail });
    if (import.meta.env.DEV) {
      console.debug('[sse:diag] drop', reason, detail ?? '');
    }
  }

  summary(): SseStreamDiagnosticsSnapshot {
    return {
      durationMs: Date.now() - this.startedAt,
      byEvent: Object.fromEntries(this.counts),
      drops: this.dropList.length,
      dropReasons: [...this.dropList],
    };
  }

  logClose(): void {
    if (!import.meta.env.DEV) return;
    console.debug('[sse:diag] stream closed', this.summary());
  }
}

class SseStreamDiagnosticsNoop implements SseStreamDiagnostics {
  recordReceived(): void {}
  recordDrop(): void {}
  summary(): SseStreamDiagnosticsSnapshot {
    return { durationMs: 0, byEvent: {}, drops: 0, dropReasons: [] };
  }
  logClose(): void {}
}

/** Use in production builds / tests — zero overhead. */
export function createSseStreamDiagnostics(): SseStreamDiagnostics {
  if (!import.meta.env.DEV) return new SseStreamDiagnosticsNoop();
  return new SseStreamDiagnosticsImpl();
}

export function attachSseDiagWindow(diag: SseStreamDiagnostics): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  (window as Window & { __SSE_DIAG?: SseStreamDiagnostics }).__SSE_DIAG = diag;
}
