import { describe, expect, it } from 'vitest';
import { PostTraceBodySchema } from '../logs.ts';

describe('POST /api/logs/trace body (Zod)', () => {
  it('rejects empty body', () => {
    expect(PostTraceBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects event missing required fields', () => {
    expect(
      PostTraceBodySchema.safeParse({
        events: [{ id: '1', at: '2026-04-01T00:00:00.000Z', kind: 'phase' }],
      }).success,
    ).toBe(false);
  });

  it('accepts minimal valid batch with correlation metadata', () => {
    const r = PostTraceBodySchema.safeParse({
      correlationId: 'run-1',
      resultId: 'res-1',
      events: [
        {
          id: 't1',
          at: '2026-04-01T12:00:00.000Z',
          kind: 'tool_started',
          label: 'read',
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.correlationId).toBe('run-1');
      expect(r.data.events[0]!.kind).toBe('tool_started');
    }
  });

  it('allows passthrough fields on trace events (forward-compat)', () => {
    const r = PostTraceBodySchema.safeParse({
      events: [
        {
          id: 't2',
          at: '2026-04-01T12:00:00.000Z',
          kind: 'file_written',
          label: 'Saved x',
          extraObservability: 'ok',
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data.events[0] as Record<string, unknown>).extraObservability).toBe('ok');
    }
  });
});
