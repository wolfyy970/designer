import { afterEach, describe, expect, it } from 'vitest';
import {
  appendTraceLines,
  clearTraceLogEntries,
  getTraceLogLines,
} from './trace-log-store.ts';

afterEach(() => {
  clearTraceLogEntries();
});

describe('trace-log-store', () => {
  it('dedupes by event.id within the ring', () => {
    const ev = {
      id: 'trace-1',
      at: '2026-04-01T12:00:00.000Z',
      kind: 'phase',
      label: 'x',
    };
    appendTraceLines([{ event: ev }, { event: { ...ev, label: 'retry' } }]);
    expect(getTraceLogLines()).toHaveLength(1);
    expect(getTraceLogLines()[0]!.payload.event.label).toBe('x');
  });

  it('keeps distinct ids', () => {
    appendTraceLines([
      {
        event: {
          id: 'a',
          at: '2026-04-01T12:00:00.000Z',
          kind: 'phase',
          label: 'one',
        },
      },
      {
        event: {
          id: 'b',
          at: '2026-04-01T12:00:01.000Z',
          kind: 'phase',
          label: 'two',
        },
      },
    ]);
    expect(getTraceLogLines().map((r) => r.payload.event.id)).toEqual(['a', 'b']);
  });

  it('clearTraceLogEntries resets state', () => {
    appendTraceLines([
      {
        event: {
          id: 'z',
          at: '2026-04-01T12:00:00.000Z',
          kind: 'phase',
          label: 'z',
        },
      },
    ]);
    clearTraceLogEntries();
    expect(getTraceLogLines()).toHaveLength(0);
    appendTraceLines([
      {
        event: {
          id: 'z',
          at: '2026-04-01T12:00:00.000Z',
          kind: 'phase',
          label: 'again',
        },
      },
    ]);
    expect(getTraceLogLines()).toHaveLength(1);
  });
});
