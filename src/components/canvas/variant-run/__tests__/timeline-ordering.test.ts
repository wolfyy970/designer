import { describe, expect, it } from 'vitest';
import type { RunTraceEvent } from '../../../../lib/run-trace-event-schema';
import type { ThinkingTurnSlice } from '../../../../types/provider';
import { buildTurnTimelineParts } from '../timeline-ordering';

/**
 * The ordering regression these cover: a turn's thinking slice used to render
 * above *all* of its tool calls no matter when it happened, so a turn that
 * reasoned, called tools, then reasoned again showed the second reasoning phase
 * above the tool calls that preceded it. DOM order must follow event time.
 */

let seq = 0;
function trace(kind: RunTraceEvent['kind'], at: string, extra?: Partial<RunTraceEvent>): RunTraceEvent {
  seq += 1;
  return {
    id: `t${seq}`,
    at,
    kind,
    label: kind,
    ...extra,
  };
}

/** Local-time ISO strings keep `Date.parse` deterministic without a TZ fixture. */
const T = (sec: number) => new Date(Date.UTC(2026, 0, 1, 12, 0, sec)).toISOString();

function slice(startedAt: number, text = 'reasoning', endedAt?: number): ThinkingTurnSlice {
  return { turnId: 1, text, startedAt, ...(endedAt != null ? { endedAt } : {}) };
}

describe('buildTurnTimelineParts', () => {
  it('keeps the familiar "reason first, then call tools" reading', () => {
    const parts = buildTurnTimelineParts({
      slice: slice(Date.parse(T(0)), 'let me look at the files'),
      traces: [
        trace('tool_started', T(5), { toolName: 'read_file' }),
        trace('tool_finished', T(6), { toolName: 'read_file' }),
      ],
    });

    expect(parts.map((p) => p.kind)).toEqual(['thinking', 'toolUse']);
  });

  it('places a late reasoning phase after the tool calls that came before it', () => {
    // Thinking begins only after the tool finished — the case that used to be
    // hoisted above the tool block.
    const parts = buildTurnTimelineParts({
      slice: slice(Date.parse(T(30)), 'the file shows X, so now I will…'),
      traces: [
        trace('tool_started', T(5), { toolName: 'read_file' }),
        trace('tool_finished', T(20), { toolName: 'read_file' }),
      ],
    });

    expect(parts.map((p) => p.kind)).toEqual(['toolUse', 'thinking']);
  });

  it('interleaves standalone traces around thinking and tool groups by time', () => {
    const parts = buildTurnTimelineParts({
      slice: slice(Date.parse(T(10)), 'reasoning'),
      traces: [
        trace('files_planned', T(5)),
        trace('tool_started', T(20), { toolName: 'write_file' }),
        trace('tool_finished', T(21), { toolName: 'write_file' }),
        trace('checkpoint', T(40)),
      ],
    });

    expect(parts.map((p) => p.kind)).toEqual(['trace', 'thinking', 'toolUse', 'trace']);
    expect(parts[0]).toMatchObject({ kind: 'trace', trace: { kind: 'files_planned' } });
    expect(parts[3]).toMatchObject({ kind: 'trace', trace: { kind: 'checkpoint' } });
  });

  it('groups only contiguous tool traces into one block', () => {
    const parts = buildTurnTimelineParts({
      traces: [
        trace('tool_started', T(1), { toolName: 'a' }),
        trace('tool_finished', T(2), { toolName: 'a' }),
        trace('checkpoint', T(3)),
        trace('tool_started', T(4), { toolName: 'b' }),
        trace('tool_failed', T(5), { toolName: 'b' }),
      ],
    });

    expect(parts.map((p) => p.kind)).toEqual(['toolUse', 'trace', 'toolUse']);
    const [first, , third] = parts;
    expect(first.kind === 'toolUse' && first.traces.map((t) => t.toolName)).toEqual(['a', 'a']);
    expect(third.kind === 'toolUse' && third.traces.map((t) => t.toolName)).toEqual(['b', 'b']);
  });

  it('omits empty or whitespace-only thinking', () => {
    const empty = buildTurnTimelineParts({
      slice: slice(Date.parse(T(0)), '   '),
      traces: [trace('tool_started', T(1))],
    });
    const missing = buildTurnTimelineParts({ traces: [trace('tool_started', T(1))] });

    expect(empty.map((p) => p.kind)).toEqual(['toolUse']);
    expect(missing.map((p) => p.kind)).toEqual(['toolUse']);
  });

  it('keeps unparseable timestamps after timed parts, in input order', () => {
    const parts = buildTurnTimelineParts({
      traces: [
        trace('checkpoint', 'not-a-date'),
        trace('tool_started', T(10), { toolName: 'a' }),
        trace('checkpoint', T(20)),
      ],
    });

    expect(parts.map((p) => p.kind)).toEqual(['toolUse', 'trace', 'trace']);
    expect(parts[1]).toMatchObject({ kind: 'trace', trace: { at: T(20) } });
    expect(parts[2]).toMatchObject({ kind: 'trace', trace: { at: 'not-a-date' } });
  });

  it('returns nothing for a turn with no traces and no thinking', () => {
    expect(buildTurnTimelineParts({ traces: [] })).toEqual([]);
  });

  it('renders a placeholder tool group while a tool streams before its first trace', () => {
    // Without this the "Tool use" row disappears for the first seconds of every
    // tool call, taking the live tool name with it.
    const parts = buildTurnTimelineParts({
      traces: [],
      slice: slice(Date.parse(T(0)), 'about to write the file'),
      streamingToolPending: true,
    });

    expect(parts.map((p) => p.kind)).toEqual(['thinking', 'toolUse']);
    expect(parts[1]).toMatchObject({ kind: 'toolUse', traces: [] });
  });

  it('anchors the streaming placeholder last, after every real trace', () => {
    const parts = buildTurnTimelineParts({
      traces: [
        trace('tool_started', T(1), { toolName: 'a' }),
        trace('tool_finished', T(2), { toolName: 'a' }),
        trace('checkpoint', T(3)),
      ],
      streamingToolPending: true,
    });

    expect(parts.map((p) => p.kind)).toEqual(['toolUse', 'trace', 'toolUse']);
    expect(parts[2]).toMatchObject({ kind: 'toolUse', traces: [] });
  });

  it('never emits a trace-less group unless a tool is streaming', () => {
    const parts = buildTurnTimelineParts({
      traces: [trace('checkpoint', T(3))],
      streamingToolPending: false,
    });

    expect(parts.some((p) => p.kind === 'toolUse' && p.traces.length === 0)).toBe(false);
  });

  it('preserves the order of traces inside a tool group', () => {
    const parts = buildTurnTimelineParts({
      traces: [
        trace('tool_started', T(1), { toolName: 'a' }),
        trace('tool_finished', T(2), { toolName: 'a' }),
        trace('tool_started', T(4), { toolName: 'b' }),
        trace('tool_failed', T(5), { toolName: 'b' }),
      ],
    });

    expect(parts).toHaveLength(1);
    const group = parts[0];
    expect(group.kind).toBe('toolUse');
    expect(group.kind === 'toolUse' && group.traces.map((t) => t.toolName)).toEqual([
      'a',
      'a',
      'b',
      'b',
    ]);
  });

  it('leaves a file_written line as a standalone trace after its tool group', () => {
    // `file_written` is not part of the tool group — it is a separate event at a
    // later timestamp, so it must interleave rather than join the block.
    const parts = buildTurnTimelineParts({
      traces: [
        trace('tool_started', T(1), { toolName: 'write_file' }),
        trace('tool_finished', T(2), { toolName: 'write_file' }),
        trace('file_written', T(3), { path: 'index.html' }),
      ],
    });

    expect(parts.map((p) => p.kind)).toEqual(['toolUse', 'trace']);
    expect(parts[1]).toMatchObject({ kind: 'trace', trace: { kind: 'file_written' } });
  });
});
