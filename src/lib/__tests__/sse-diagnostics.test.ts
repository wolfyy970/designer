import { describe, it, expect } from 'vitest';
import {
  createSseStreamDiagnostics,
  attachSseDiagWindow,
} from '../sse-diagnostics';

describe('SseStreamDiagnostics', () => {

  it('counts received events by type', () => {
    const diag = createSseStreamDiagnostics();
    diag.recordReceived('activity');
    diag.recordReceived('activity');
    diag.recordReceived('trace');
    const snap = diag.summary();
    expect(snap.byEvent).toEqual({ activity: 2, trace: 1 });
    expect(snap.drops).toBe(0);
  });

  it('records drops with reason and detail', () => {
    const diag = createSseStreamDiagnostics();
    diag.recordDrop('zod', 'bad_event');
    diag.recordDrop('empty_event_name');
    const snap = diag.summary();
    expect(snap.drops).toBe(2);
    expect(snap.dropReasons).toEqual([
      { reason: 'zod', detail: 'bad_event' },
      { reason: 'empty_event_name', detail: undefined },
    ]);
  });

  it('summary includes duration', () => {
    const diag = createSseStreamDiagnostics();
    const snap = diag.summary();
    expect(snap.durationMs).toBeGreaterThanOrEqual(0);
    expect(snap.durationMs).toBeLessThan(1000);
  });

  it('attachSseDiagWindow is a no-op when window is undefined', () => {
    const diag = createSseStreamDiagnostics();
    expect(() => attachSseDiagWindow(diag)).not.toThrow();
  });
});
