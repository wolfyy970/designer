import { describe, it, expect } from 'vitest';
import { oneLinePreviewTail, wireDetailSnippet, wirePayloadLine } from '../wire-formatters.ts';

describe('wirePayloadLine (meta-harness TUI)', () => {
  it('formats incubate_result hypothesis count', () => {
    expect(
      wirePayloadLine('incubate_result', {
        hypotheses: [{ id: '1' }, { id: '2' }],
      }),
    ).toBe('incubate done: 2 hypotheses');
  });

  it('formats meta_json_wait', () => {
    expect(wirePayloadLine('meta_json_wait', { elapsedSec: 12 })).toBe(
      'waiting for eval meta.json… 12s',
    );
  });

  it('formats progress and code stream (count + tail preview)', () => {
    expect(wirePayloadLine('progress', { status: 'Waiting for model…' })).toBe(
      'progress: Waiting for model…',
    );
    const line = wirePayloadLine('code', { code: 'abc'.repeat(100) });
    expect(line.startsWith('code: 300 chars · ')).toBe(true);
    expect(line.endsWith('abc')).toBe(true);
  });

  it('oneLinePreviewTail keeps a bounded tail', () => {
    expect(oneLinePreviewTail('hello world', 80)).toBe('hello world');
    expect(oneLinePreviewTail(`${'x'.repeat(50)}end`, 8)).toBe(`…${'x'.repeat(5)}end`);
  });

  it('wireDetailSnippet never embeds full code JSON', () => {
    const huge = `{${'y'.repeat(5000)}}`;
    const s = wireDetailSnippet('code', { code: huge });
    expect(s.startsWith(`[code] ${huge.length} chars · `)).toBe(true);
    expect(s.length).toBeLessThan(180);
    expect(s).toContain('…');
  });

  it('formats streaming_tool with k suffix', () => {
    expect(
      wirePayloadLine('streaming_tool', {
        toolName: 'write',
        streamedChars: 2500,
        done: false,
        toolPath: '/tmp/x',
      }),
    ).toMatch(/write \/tmp\/x \(2\.5k chars\)/);
  });

  it('passes unknown events through', () => {
    expect(wirePayloadLine('custom_event', {})).toBe('custom_event');
  });

  it('formats evaluation_report with aggregate', () => {
    const line = wirePayloadLine('evaluation_report', {
      round: 2,
      snapshot: {
        aggregate: { overallScore: 4.2, shouldRevise: true },
      },
    });
    expect(line).toContain('eval r2');
    expect(line).toContain('4.20');
    expect(line).toContain('revising');
  });

  it('formats skills_loaded count', () => {
    expect(wirePayloadLine('skills_loaded', { skills: [{ k: 'a' }, { k: 'b' }] })).toBe('skills loaded: 2');
  });

  it('formats revision_round', () => {
    expect(wirePayloadLine('revision_round', { round: 1 })).toBe('revision r1…');
  });
});
