import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  type GenerateSSEEvent,
  generateSSEEventSchema,
  mergeSseEventPayload,
  safeParseGenerateSSEEvent,
} from '../generate-sse-event-schema';

describe('mergeSseEventPayload', () => {
  it('forces SSE event name over body type', () => {
    const merged = mergeSseEventPayload('progress', {
      type: 'error',
      status: 'ok',
    } as Record<string, unknown>);
    expect(merged).toEqual({ status: 'ok', type: 'progress' });
  });
});

describe('safeParseGenerateSSEEvent', () => {
  it('accepts minimal progress', () => {
    const r = safeParseGenerateSSEEvent('progress', { status: 'x' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event).toEqual({ type: 'progress', status: 'x' });
  });

  it('accepts thinking with turnId and delta', () => {
    const r = safeParseGenerateSSEEvent('thinking', { delta: 'hello', turnId: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event).toEqual({ type: 'thinking', delta: 'hello', turnId: 2 });
  });

  it('accepts trace with extra trace fields', () => {
    const r = safeParseGenerateSSEEvent('trace', {
      trace: {
        id: '1',
        at: 't',
        kind: 'tool_started',
        label: 'ls',
        toolName: 'ls',
        phase: 'building',
      },
    });
    expect(r.ok).toBe(true);
  });

  it('accepts done with empty body', () => {
    const r = safeParseGenerateSSEEvent('done', {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.type).toBe('done');
  });

  it('accepts evaluation_report with loose snapshot', () => {
    const r = safeParseGenerateSSEEvent('evaluation_report', {
      round: 1,
      snapshot: { round: 1, aggregate: { overallScore: 3 } },
    });
    expect(r.ok).toBe(true);
  });

  it('rejects evaluation_report snapshot missing round', () => {
    const r = safeParseGenerateSSEEvent('evaluation_report', {
      round: 1,
      snapshot: { aggregate: { overallScore: 3 } },
    });
    expect(r.ok).toBe(false);
  });

  it('accepts skills_loaded', () => {
    const r = safeParseGenerateSSEEvent('skills_loaded', {
      skills: [{ key: 'k', name: 'N', description: 'D' }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.type).toBe('skills_loaded');
  });

  it('accepts skill_activated', () => {
    const r = safeParseGenerateSSEEvent('skill_activated', {
      key: 'accessibility',
      name: 'A11y',
      description: 'Test',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.type).toBe('skill_activated');
  });

  it('accepts evaluation_worker_done with report passthrough', () => {
    const r = safeParseGenerateSSEEvent('evaluation_worker_done', {
      round: 1,
      rubric: 'design',
      report: {
        rubric: 'design',
        scores: { a: { score: 4, notes: 'ok' } },
        findings: [],
        hardFails: [],
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.event.type === 'evaluation_worker_done') {
      expect(r.event.round).toBe(1);
      expect(r.event.rubric).toBe('design');
      expect(r.event.report.scores).toEqual({ a: { score: 4, notes: 'ok' } });
    }
  });

  it('accepts streaming_tool with optional toolPath', () => {
    const r = safeParseGenerateSSEEvent('streaming_tool', {
      toolName: 'write_file',
      streamedChars: 2400,
      done: false,
      toolPath: 'styles.css',
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.event).toEqual({
        type: 'streaming_tool',
        toolName: 'write_file',
        streamedChars: 2400,
        done: false,
        toolPath: 'styles.css',
      });
  });

  it('accepts streaming_tool without toolPath', () => {
    const r = safeParseGenerateSSEEvent('streaming_tool', {
      toolName: 'bash',
      streamedChars: 0,
      done: true,
    });
    expect(r.ok).toBe(true);
  });

  it('accepts checkpoint with required envelope', () => {
    const r = safeParseGenerateSSEEvent('checkpoint', {
      checkpoint: {
        totalRounds: 2,
        completedAt: '2026-01-01T00:00:00.000Z',
        filesWritten: ['index.html'],
        stopReason: 'satisfied',
      },
    });
    expect(r.ok).toBe(true);
  });

  it('rejects checkpoint missing completedAt', () => {
    const r = safeParseGenerateSSEEvent('checkpoint', {
      checkpoint: { totalRounds: 1 },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects empty event name', () => {
    const r = safeParseGenerateSSEEvent('', { status: 'x' });
    expect(r.ok).toBe(false);
  });

  it('rejects progress without status', () => {
    const r = safeParseGenerateSSEEvent('progress', {});
    expect(r.ok).toBe(false);
  });

  it('rejects unknown event type string', () => {
    const r = safeParseGenerateSSEEvent('not_a_real_event', { foo: 1 });
    expect(r.ok).toBe(false);
  });

  it('rejects todos with invalid status', () => {
    const r = safeParseGenerateSSEEvent('todos', {
      todos: [{ id: '1', task: 't', status: 'bogus' }],
    });
    expect(r.ok).toBe(false);
  });
});

describe('generateSSEEventSchema', () => {
  it('parses lane_done', () => {
    const r = generateSSEEventSchema.safeParse({ type: 'lane_done', laneIndex: 0 });
    expect(r.success).toBe(true);
  });

  it('GenerateSSEEvent alias matches z.infer<typeof generateSSEEventSchema> (compile-time)', () => {
    type Inferred = z.infer<typeof generateSSEEventSchema>;
    const _roundTrip: GenerateSSEEvent = {} as Inferred;
    const _back: Inferred = {} as GenerateSSEEvent;
    expect(_roundTrip).toBeDefined();
    expect(_back).toBeDefined();
  });
});
