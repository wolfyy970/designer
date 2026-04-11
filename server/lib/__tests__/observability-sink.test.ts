import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ObservabilityLine } from '../observability-line.ts';
import { observabilityLineForFile } from '../observability-sink.ts';

describe('observabilityLineForFile', () => {
  const prevMax = process.env.LLM_LOG_MAX_BODY_CHARS;

  beforeEach(() => {
    process.env.LLM_LOG_MAX_BODY_CHARS = '8';
  });

  afterEach(() => {
    if (prevMax === undefined) delete process.env.LLM_LOG_MAX_BODY_CHARS;
    else process.env.LLM_LOG_MAX_BODY_CHARS = prevMax;
  });

  it('truncates incubate_parsed firstHypothesisText', () => {
    const line: ObservabilityLine = {
      v: 1,
      ts: 't',
      type: 'incubate_parsed',
      payload: {
        correlationId: 'c',
        hypothesisCount: 1,
        hypothesisNames: ['a'],
        firstHypothesisText: 'x'.repeat(20),
        dimensionCount: 0,
      },
    };
    const out = observabilityLineForFile(line);
    expect(out.type).toBe('incubate_parsed');
    if (out.type !== 'incubate_parsed') throw new Error('narrow');
    expect(out.payload.firstHypothesisText).toContain('truncated');
    expect(out.payload.firstHypothesisText).not.toBe('x'.repeat(20));
  });

  it('truncates task_run string fields like task_result', () => {
    const line: ObservabilityLine = {
      v: 1,
      ts: 't',
      type: 'task_run',
      payload: { resultContent: 'y'.repeat(20) },
    };
    const out = observabilityLineForFile(line);
    expect(out.type).toBe('task_run');
    if (out.type !== 'task_run') throw new Error('narrow');
    expect(String(out.payload.resultContent)).toContain('truncated');
  });

  it('truncates task_result string fields', () => {
    const line: ObservabilityLine = {
      v: 1,
      ts: 't',
      type: 'task_result',
      payload: {
        resultContent: 'y'.repeat(20),
        userPrompt: 'z'.repeat(20),
        error: 'e'.repeat(20),
      },
    };
    const out = observabilityLineForFile(line);
    expect(out.type).toBe('task_result');
    if (out.type !== 'task_result') throw new Error('narrow');
    for (const k of ['resultContent', 'userPrompt', 'error'] as const) {
      const v = String(out.payload[k]);
      expect(v).toContain('truncated');
      expect(v).not.toBe('y'.repeat(20));
    }
  });

  it('truncates trace event label and tool fields', () => {
    const line: ObservabilityLine = {
      v: 1,
      ts: 't',
      type: 'trace',
      payload: {
        correlationId: 'c',
        event: {
          label: 'L'.repeat(5000),
          detail: 'd'.repeat(5000),
          toolArgs: 'a'.repeat(5000),
          toolResult: 'r'.repeat(5000),
        },
      },
    };
    const out = observabilityLineForFile(line);
    expect(out.type).toBe('trace');
    if (out.type !== 'trace') throw new Error('narrow');
    const ev = out.payload.event as Record<string, unknown>;
    expect(String(ev.label).length).toBeLessThan(5000);
    expect(String(ev.detail).length).toBeLessThan(5000);
  });

  it('truncates default llm payload prompts and response', () => {
    const line: ObservabilityLine = {
      v: 1,
      ts: 't',
      type: 'llm',
      payload: {
        systemPrompt: 's'.repeat(20),
        userPrompt: 'u'.repeat(20),
        response: 'r'.repeat(20),
      },
    };
    const out = observabilityLineForFile(line);
    expect(out.type).toBe('llm');
    if (out.type !== 'llm') throw new Error('narrow');
    for (const k of ['systemPrompt', 'userPrompt', 'response'] as const) {
      const orig = k === 'systemPrompt' ? 's'.repeat(20) : k === 'userPrompt' ? 'u'.repeat(20) : 'r'.repeat(20);
      const v = String(out.payload[k]);
      expect(v).toContain('truncated');
      expect(v).not.toBe(orig);
    }
  });

  it('returns line unchanged when LLM_LOG_MAX_BODY_CHARS is 0', () => {
    process.env.LLM_LOG_MAX_BODY_CHARS = '0';
    const line: ObservabilityLine = {
      v: 1,
      ts: 't',
      type: 'llm',
      payload: { response: 'long text' },
    };
    expect(observabilityLineForFile(line)).toEqual(line);
  });
});
