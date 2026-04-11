import { describe, it, expect, vi } from 'vitest';
import { dispatchParsedAgenticSseEvent } from '../client';
import { SSE_EVENT_NAMES } from '../../constants/sse-events';
import { safeParseGenerateSSEEvent } from '../../lib/generate-sse-event-schema';

describe('dispatchParsedAgenticSseEvent', () => {
  it('dispatches progress to onProgress', () => {
    const onProgress = vi.fn();
    const parsed = safeParseGenerateSSEEvent(SSE_EVENT_NAMES.progress, { status: 'Building…' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    dispatchParsedAgenticSseEvent(parsed.event, { onProgress });
    expect(onProgress).toHaveBeenCalledWith('Building…');
  });

  it('dispatches trace to onTrace', () => {
    const onTrace = vi.fn();
    const trace = {
      id: 't1',
      at: new Date().toISOString(),
      kind: 'phase' as const,
      label: 'Build phase',
      status: 'info' as const,
    };
    const parsed = safeParseGenerateSSEEvent(SSE_EVENT_NAMES.trace, { trace });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    dispatchParsedAgenticSseEvent(parsed.event, { onTrace });
    expect(onTrace).toHaveBeenCalledWith(trace);
  });
});
